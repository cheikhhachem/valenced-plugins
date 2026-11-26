/// <reference types="@valenced/types" />

import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'

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

		unpatchSend = patcher.instead(socket, 'send', function(this: unknown, args: unknown[], original: (...args: unknown[]) => unknown) {
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
			unpatchGetter = patcher.after(gateway, 'getSocket', (_args: unknown[], result: unknown) => {
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
let unregisterCommands: (() => void)[] = []

function statusText() {
	if (!controller) return 'Fake deafen: unavailable — plugin is not started.'
	const state = controller.status()
	if (state.state === 'unavailable') return 'Fake deafen: unavailable — compatible gateway socket not found.'
	if (state.state === 'requested') {
		return `Fake deafen: request sent; microphone unchanged.${state.realDeaf ? ' Normal Deafen is also ON.' : ''}`
	}
	if (state.state === 'armed') return 'Fake deafen: armed; the next voice-state update will carry the deafened flag.'
	return 'Fake deafen: off.'
}

export default plugin({
	start(api) {
		controller ??= createController(api)
		controller.start()

		const commandApi = api.commands?.commands
		if (typeof commandApi?.registerCommand !== 'function') {
			api.plugin?.reportError?.(new Error('Coco\'s Command Lib is unavailable'))
			return
		}

		const notify = (text: string, variant: 'default' | 'success' | 'critical' = 'default') => {
			api.unscoped.discord.actions.ToastActionCreators.open('vermillion.fake-deafen', { text, variant })
		}
		const toggle = () => {
			try {
				if (!controller) throw new Error('Plugin is not started')
				controller.setEnabled(!controller.status().enabled)
				notify(statusText(), 'success')
			} catch (error) {
				notify(`Fake deafen: unable to change state — ${error instanceof Error ? error.message : 'unknown error'}`, 'critical')
			}
		}
		const command = (name: string, description: string, execute: (...args: any[]) => void) => ({
			name,
			displayName: name,
			description,
			displayDescription: description,
			applicationId: '-1',
			inputType: 1,
			type: 1,
			shouldHide: () => false,
			execute,
		})

		try {
			unregisterCommands = [
				commandApi.registerCommand(command('fd', 'Toggle reported deafening without changing the microphone.', () => toggle())),
				commandApi.registerCommand(command('fdstatus', 'Show Fake deafen diagnostics.', () => notify(statusText()))),
			]
		} catch (error) {
			for (const unregister of unregisterCommands.splice(0)) unregister()
			api.plugin?.reportError?.(error)
		}
	},
	stop() {
		for (const unregister of unregisterCommands.splice(0)) unregister()
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
		const { TableRowGroup, TableSwitchRow } = Design
		return React.createElement(
			Page,
			null,
			React.createElement(
				TableRowGroup,
				null,
				React.createElement(TableSwitchRow, {
					icon: React.createElement(TableRowAssetIcon, { name: 'PhoneCallIcon' }),
					label: 'Fake deafen',
					subLabel: current?.state ?? 'Unavailable',
					value: Boolean(current?.enabled),
					onValueChange: toggle,
				}),
			),
			React.createElement(ReactNative.Text, { style: { margin: 16, fontSize: 14 } }, statusText()),
			React.createElement(ReactNative.Pressable, { onPress: () => update((value: number) => value + 1), style: { margin: 16 } },
				React.createElement(ReactNative.Text, null, 'Refresh status'),
			),
		)
	},
})
