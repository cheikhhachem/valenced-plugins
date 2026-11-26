# Fake Deafen

Reports the voice state as deafened while leaving the microphone setting and local audio controls unchanged.

## Behavior

- Toggle Fake Deafen from the plugin settings.
- The plugin starts disabled.
- Your microphone state is not changed.
- Your local audio controls are not changed.
- Leaving voice or replacing the gateway socket resets the toggle.
- The plugin reports when the compatible gateway hook is unavailable instead of claiming success.

This is a client-side voice-state experiment. `REQUESTED` means the modified gateway payload was sent; it is not independent proof of the remote icon or audible playback.

## Credits

Inspired by the original DeafenVencord plugin by fizzexual.
