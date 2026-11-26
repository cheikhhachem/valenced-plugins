/// <reference types="@valenced/types" />

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import Page from '@valenced/components/Page'
import { Design } from '@valenced/discord/design'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'

const VIEW_CHANNEL = 1024
const SKIP_CHANNEL_TYPES = new Set([1, 3, 4])

let enabled = true
let permissionsModule: any
const realPermissionChecks = new WeakSet<object>()
const diagnostics = {
	starts: 0,
	moduleFound: false,
	patchInstalled: false,
	canCalls: 0,
	viewCalls: 0,
	hiddenDetected: 0,
	lastChannel: '',
	lastType: '',
}

function diagnosticsText() {
	return [
		`Enabled: ${enabled}`,
		`Plugin starts: ${diagnostics.starts}`,
		`Permission module found: ${diagnostics.moduleFound}`,
		`Permission patch installed: ${diagnostics.patchInstalled}`,
		`can() calls observed: ${diagnostics.canCalls}`,
		`VIEW_CHANNEL checks: ${diagnostics.viewCalls}`,
		`Denied channels detected: ${diagnostics.hiddenDetected}`,
		`Last channel: ${diagnostics.lastChannel || 'none'}`,
		`Last channel type: ${diagnostics.lastType || 'none'}`,
	].join('\n')
}

function isHidden(channel: any): boolean {
	if (!enabled || !channel || typeof channel !== 'object') return false
	if (SKIP_CHANNEL_TYPES.has(channel.type)) return false
	if (!permissionsModule || typeof permissionsModule.can !== 'function') return false

	realPermissionChecks.add(channel)
	try {
		return !permissionsModule.can(VIEW_CHANNEL, channel)
	} finally {
		realPermissionChecks.delete(channel)
	}
}

export default plugin({
	start({ cleanup, plugin }) {
		diagnostics.starts += 1
		cleanup(
			getModules(withProps('can'), module => {
				permissionsModule = module
				diagnostics.moduleFound = true
				cleanup(
					instead(module, 'can', (args, original) => {
						const [permission, channel] = args
						diagnostics.canCalls += 1
						if (permission === VIEW_CHANNEL) {
							diagnostics.viewCalls += 1
							diagnostics.lastChannel = String(channel?.name ?? channel?.id ?? 'unnamed')
							diagnostics.lastType = String(channel?.type ?? 'unknown')
						}
						if (
							permission === VIEW_CHANNEL &&
							channel &&
							!realPermissionChecks.has(channel) &&
							isHidden(channel)
						) {
							diagnostics.hiddenDetected += 1
							return true
						}
						return original(...args)
					}),
				)
				diagnostics.patchInstalled = true
			}),
		)

	},
	stop() {
		permissionsModule = undefined
		diagnostics.patchInstalled = false
	},
	SettingsComponent({ api }) {
		const { React, ReactNative: RN } = api.unscoped.react
		const [, refresh] = React.useState(0)
		const { TableRowGroup, TableSwitchRow } = Design
		return React.createElement(
			Page,
			null,
			React.createElement(
				TableRowGroup,
				null,
				React.createElement(TableSwitchRow, {
					icon: React.createElement(TableRowAssetIcon, { name: 'AppsIcon' }),
					label: 'Show hidden channels',
					subLabel: 'Shows channels present in the client cache when Discord denies VIEW_CHANNEL.',
					value: enabled,
					onValueChange: (value: boolean) => {
						enabled = value
						refresh(value ? 1 : 0)
					},
				}),
			),
			React.createElement(
				RN.Text,
				{ style: { margin: 16, fontSize: 13 } },
				diagnosticsText(),
			),
			React.createElement(
				RN.Pressable,
				{ onPress: () => refresh(value => value + 1), style: { margin: 16 } },
				React.createElement(RN.Text, null, 'Refresh diagnostics'),
			),
		)
	},
})
