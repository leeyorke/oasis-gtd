// Completion chime for the Pomodoro timer.
//
// The AudioContext is created lazily from a user gesture (the Start click) so
// autoplay policies never block it, and is reused for the session's lifetime.

let audioContext: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null

  if (!audioContext) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      audioContext = new Ctor()
    } catch {
      return null
    }
  }

  // Browsers suspend the context until a gesture unlocks it.
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

/** Warm up the audio context during a user gesture (Start button). */
export function primeFocusAudio(): void {
  getContext()
}

/** Two short bell tones, played when a focus session reaches zero. */
export function playFocusChime(): void {
  const audio = getContext()
  if (!audio) return

  const start = audio.currentTime
  const tones: { offset: number; frequency: number }[] = [
    { offset: 0, frequency: 880 },
    { offset: 0.28, frequency: 1174.66 },
  ]

  for (const { offset, frequency } of tones) {
    const oscillator = audio.createOscillator()
    const gain = audio.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, start + offset)
    // Short attack + exponential decay keeps the chime soft rather than clicky.
    gain.gain.setValueAtTime(0, start + offset)
    gain.gain.linearRampToValueAtTime(0.16, start + offset + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.26)

    oscillator.connect(gain).connect(audio.destination)
    oscillator.start(start + offset)
    oscillator.stop(start + offset + 0.3)
  }
}