/// <reference types="@valenced/types" />

interface CommandsApi {
	commands: {
		registerCommand(command: {
			name: string
			displayName: string
			description: string
			displayDescription: string
			applicationId: string
			inputType: number
			type: number
			shouldHide: () => boolean
			execute: () => { content: string }
		}): () => void
	}
}

let unregister: (() => void) | undefined

export default plugin({
	start(api: any) {
		const { registerCommand } = (api.commands as CommandsApi).commands
		unregister = registerCommand({
			name: 'test',
			displayName: 'test',
			description: 'Send a command test reply.',
			displayDescription: 'Send a command test reply.',
			applicationId: '-1',
			inputType: 1,
			type: 1,
			shouldHide: () => false,
			execute: () => ({ content: 'hello' }),
		})
	},
	stop() {
		unregister?.()
		unregister = undefined
	},
})
