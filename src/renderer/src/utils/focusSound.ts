// Completion ringtone for the Pomodoro timer.
//
// The sound is a file the user picks from their own machine (see the Pomodoro
// section in Settings) — nothing is bundled with the app.
//
// The bytes are fetched over IPC and wrapped in a Blob rather than handed to
// <audio src="file://...">. Chromium refuses to load file:// subresources when
// the page itself came from http://, which is the normal case in dev where
// electron-vite serves the renderer from a dev server. Going through a Blob URL
// sidesteps the origin check entirely, so dev and production behave the same.

let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null

/**
 * Play the configured ringtone. No-ops when nothing is set, and never throws —
 * a deleted or corrupt file must not interrupt the completion flow that also
 * fires the OS notification.
 */
export async function playFocusSound(): Promise<void> {
  try {
    const result = await window.api.playFocusSound()
    if (!result.ok || !result.bytes) {
      console.warn('[Focus] Ringtone unavailable:', result.reason)
      return
    }

    const blob = new Blob([result.bytes], { type: result.mime || 'application/octet-stream' })

    // Revoke the previous URL before swapping, or every completion leaks one.
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(blob)

    if (!audio) audio = new Audio()
    audio.src = objectUrl
    await audio.play()
  } catch (err) {
    console.warn('[Focus] Failed to play ringtone:', err)
  }
}

/** Stop any in-flight playback (used when the selection is cleared). */
export function stopFocusSound(): void {
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}