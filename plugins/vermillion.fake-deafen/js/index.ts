/// <reference types="@valenced/types" />

interface VoiceStatePayload {
	channel_id: string | null
	guild_id?: string | null
	self_deaf: boolean
	self_mute: boolean
	[key: string]: unknown
}

interface FakeDeafenController {
	status(): {
		state: 'stopped' | 'unavailable' | 'off' | 'armed' | 'requested'
		enabled: boolean
		hookReady: boolean
		realDeaf: boolean
	}
	start(): void
	setEnabled(value: boolean): void
	stop(): void
}

function createController(api: any): FakeDeafenController {
	const { modules, patcher } = api.unscoped
	let socket: any = null
	let unpatchSend: (() => void) | undefined
	let unpatchGetter: (() => void) | undefined
	let started = false
	let enabled = false
	let last: VoiceStatePayload | null = null
	let applied = false

	const status = () => ({
		state: !started
			? 'stopped'
			: !unpatchSend
				? 'unavailable'
				: enabled
					? applied
						? 'requested'
						: 'armed'
					: 'off',
		enabled,
		hookReady: Boolean(unpatchSend),
		realDeaf: last?.self_deaf === true,
	}) as ReturnType<FakeDeafenController['status']>

	const lookup = (property: string): any | null => {
		const finder = modules.finders
		const result = finder.lookupModule(finder.filters.withProps(property))
		return Array.isArray(result) ? result[0] : null
	}

	const getGateway = () => lookup('getSocket')
	const getVoiceStore = () => lookup('getVoiceChannelId')

	function adopt(candidate: any) {
		if (socket === candidate) return
		unpatchSend?.()
		unpatchSend = undefined
		socket = candidate
		enabled = false
		last = null
		applied = false

		if (!socket || typeof socket.send !== 'function' || typeof socket.voiceStateUpdate !== 'function') return

		unpatchSend = patcher.instead('send', socket, function(this: unknown, args: unknown[], original: (...args: unknown[]) => unknown) {
			const opcode = args[0]
			const payload = args[1] as Partial<VoiceStatePayload> | undefined
			const isVoiceUpdate = opcode === 4
				&& payload !== null
				&& typeof payload === 'object'
				&& (payload.channel_id === null || typeof payload.channel_id === 'string')
				&& (payload.guild_id == null || typeof payload.guild_id === 'string')
				&& typeof payload.self_deaf === 'boolean'
				&& typeof payload.self_mute === 'boolean'

			if (!isVoiceUpdate) return original.apply(this, args)
			const real = { ...payload } as VoiceStatePayload

			if (real.channel_id === null) {
				const result = original.apply(this, args)
				last = null
				enabled = false
				applied = false
				return result
			}

			const output = enabled
				? [4, { ...real, self_deaf: true }, ...args.slice(2)]
				: args
			const result = original.apply(this, output)
			last = real
			applied = enabled
			return result
		})
	}

	function refresh() {
		const gateway = getGateway()
		adopt(gateway?.getSocket?.())
	}

	return {
		status,
		start() {
			if (started) return
			started = true
			const gateway = getGateway()
			if (!gateway || typeof gateway.getSocket !== 'function') return
			unpatchGetter = patcher.after('getSocket', gateway, (_result: unknown, result: unknown) => {
				adopt(result)
			})
			refresh()
		},
		setEnabled(value: boolean) {
			if (!started) throw new Error('Plugin is stopped')
			refresh()
			if (value && !unpatchSend) throw new Error('Compatible gateway socket unavailable')
			enabled = Boolean(value)
			applied = false
			try {
				const voiceStore = getVoiceStore()
				const currentChannel = voiceStore?.getVoiceChannelId?.()
				if (last?.channel_id != null && last.channel_id === currentChannel) {
					socket.send(4, { ...last })
				}
			} catch (error) {
				enabled = false
				applied = false
				last = null
				throw error
			}
		},
		stop() {
			if (!started) return
			try {
				if (enabled) this.setEnabled(false)
			} finally {
				unpatchGetter?.()
				unpatchSend?.()
				unpatchGetter = undefined
				unpatchSend = undefined
				socket = null
				last = null
				enabled = false
				applied = false
				started = false
			}
		},
	}
}

let controller: FakeDeafenController | undefined

export default plugin({
	start(api) {
		controller ??= createController(api)
		controller.start()
	},
	stop() {
		controller?.stop()
	},
	SettingsComponent({ api }) {
		const { React, ReactNative } = api.unscoped.react
		const [, update] = React.useState(0)
		const current = controller?.status()
		const showToast = (text: string, variant: 'default' | 'success' | 'critical' = 'default') => {
			api.unscoped.discord.actions.ToastActionCreators.open('vermillion.fake-deafen', { text, variant })
		}
		const toggle = () => {
			if (!controller) {
				showToast('Fake Deafen: unavailable', 'critical')
				return
			}
			try {
				controller.setEnabled(!controller.status().enabled)
				showToast(controller.status().enabled ? 'Fake Deafen: enabled' : 'Fake Deafen: disabled', 'success')
				update((value: number) => value + 1)
			} catch {
				showToast('Fake Deafen: compatible gateway socket not found', 'critical')
			}
		}
		const button = (label: string, action: () => void) => React.createElement(
			ReactNative.Pressable,
			{ onPress: action, style: { padding: 14, marginVertical: 6, backgroundColor: '#34415b', borderRadius: 8 } },
			React.createElement(ReactNative.Text, { style: { color: 'white', fontSize: 16 } }, label),
		)
		return React.createElement(
			ReactNative.ScrollView,
			{ contentContainerStyle: { padding: 18, flexGrow: 1 } },
			React.createElement(ReactNative.Text, { style: { fontSize: 21, marginBottom: 16 } }, 'Fake Deafen'),
			React.createElement(ReactNative.Text, { style: { fontSize: 16, marginBottom: 16 } }, `Status: ${current?.state ?? 'unavailable'}`),
			button(current?.enabled ? 'Turn OFF' : 'Turn ON', toggle),
			button('Refresh status', () => update((value: number) => value + 1)),
			React.createElement(
				ReactNative.Text,
				{ style: { fontSize: 14, marginTop: 12 } },
				'Fake Deafen changes the reported deafened flag only. It does not change your microphone setting or audio controls. Keep normal Deafen off if you want to hear audio.',
			),
		)
	},
})
