/// <reference types="@valenced/types" />

import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'

interface ApplicationCommand {
	id?: string
	name: string
	displayName?: string
	description: string
	displayDescription?: string
	applicationId?: string
	inputType?: number
	type?: number
	shouldHide?: () => boolean
	execute: (...args: any[]) => any
	[key: string]: unknown
}

const commands: ApplicationCommand[] = []
let unsubscribeModules: (() => void) | undefined
let unpatchCommands: (() => void) | undefined

function patchCommandModule(commandsModule: any) {
	const builtInCommands = commandsModule.getBuiltInCommands(1, true, false)
	const lastCommand = [...builtInCommands]
		.sort((a, b) => Number(b.id) - Number(a.id))
		.at(-1)

	for (const command of commands) {
		command.id ??= String(Number(lastCommand?.id ?? 1) - 1 - commands.indexOf(command))
		command.applicationId ??= '-1'
		command.inputType ??= 1
		command.type ??= 1
		command.displayName ??= command.name
		command.displayDescription ??= command.description
		command.shouldHide ??= () => false
	}

	unpatchCommands?.()
	unpatchCommands = instead(commandsModule, 'getBuiltInCommands', (args: any[], original: (...args: any[]) => any[]) => {
		const result = original.apply(commandsModule, args)
		const commandType = args[0]
		const matchesType = (command: ApplicationCommand) => Array.isArray(commandType)
			? commandType.includes(command.type)
			: command.type === commandType
		return result.concat(commands.filter(command => matchesType(command) && !command.shouldHide?.()))
	})
}

function ensurePatched() {
	if (unsubscribeModules) return
	unsubscribeModules = getModules(withProps('getBuiltInCommands'), patchCommandModule)
}

const commandLib = {
	registerCommand(command: ApplicationCommand) {
		command.applicationId ??= '-1'
		command.inputType ??= 1
		command.type ??= 1
		command.displayName ??= command.name
		command.displayDescription ??= command.description
		command.shouldHide ??= () => false
		commands.push(command)
		ensurePatched()
		return () => {
			const index = commands.indexOf(command)
			if (index !== -1) commands.splice(index, 1)
		}
	},
}

export default plugin({
	init({ decorate }) {
		decorate((target: any) => {
			target.api.commandLib = commandLib
		})
	},
	start() {
		ensurePatched()
	},
	stop() {
		commands.splice(0)
		unpatchCommands?.()
		unpatchCommands = undefined
		unsubscribeModules?.()
		unsubscribeModules = undefined
	},
})
