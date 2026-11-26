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
		cleanup(
			getModules(withProps('can'), module => {
				permissionsModule = module
				cleanup(
					instead(module, 'can', (args, original) => {
						const [permission, channel] = args
						if (
							permission === VIEW_CHANNEL &&
							channel &&
							!realPermissionChecks.has(channel) &&
							isHidden(channel)
						) {
							return true
						}
						return original(...args)
					}),
				)
			}),
		)

	},
	stop() {
		permissionsModule = undefined
	},
	SettingsComponent({ api }) {
		const { React } = api.unscoped.react
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
		)
	},
})
