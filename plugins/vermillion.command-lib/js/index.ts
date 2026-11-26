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
	untranslatedName?: string
	untranslatedDescription?: string
	applicationId?: string
	inputType?: number
	type?: number
	shouldHide?: () => boolean
	execute: (...args: any[]) => any
	[key: string]: unknown
}

const commands: ApplicationCommand[] = []
const patches = new Set<() => void>()

function patchCommands() {
	if (patches.size > 0) return
	getModules(withProps('getBuiltInCommands'), (commandsModule: any) => {
		const unpatch = instead(
			commandsModule,
			'getBuiltInCommands',
			(args: any[], original: (...args: any[]) => any[]) => {
				const result = original.apply(commandsModule, args)
				const commandType = args[0]
				const matchesType = (command: ApplicationCommand) => Array.isArray(commandType)
					? commandType.includes(command.type)
					: command.type === commandType
				return result.concat(
					commands.filter(command => matchesType(command) && !command.shouldHide?.()),
				)
			},
		)
		patches.add(unpatch)
	})
}

function unpatchCommands() {
	for (const unpatch of patches) unpatch()
	patches.clear()
}

const commandsApi = {
	registerCommand(command: ApplicationCommand) {
		const unsubscribe = getModules(
			withProps('getBuiltInCommands'),
			(commandsModule: any) => {
				let builtInCommands: ApplicationCommand[]
				try {
					builtInCommands = commandsModule.getBuiltInCommands(1, true, false)
				} catch {
					builtInCommands = commandsModule.getBuiltInCommands(
						[1, 2, 3, 4, 5],
						true,
						false,
					)
				}

				builtInCommands.sort((a, b) => Number(b.id) - Number(a.id))
				const lastCommand = builtInCommands.at(-1)
				command.id = String(Number(lastCommand?.id ?? 1) - 1)
				command.applicationId ??= '-1'
				command.type ??= 1
				command.inputType ??= 1
				command.displayName ??= command.name
				command.untranslatedName ??= command.name
				command.displayDescription ??= command.description
				command.untranslatedDescription ??= command.description
				command.shouldHide ??= () => false
				commands.push(command)
			},
		)

		return () => {
			unsubscribe()
			const index = commands.indexOf(command)
			if (index !== -1) commands.splice(index, 1)
		}
	},
}

const commandsLib = { commands: commandsApi }

export default plugin({
	start({ decorate }) {
		patchCommands()
		decorate((target: any) => {
			target.api.commands = commandsLib
		})
	},
	stop() {
		commands.splice(0)
		unpatchCommands()
	},
})
