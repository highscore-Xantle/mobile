import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Synthesized locally (see the sounds skill/gen script) — no external assets
// or licensing to track. See assets/sounds/.
const SOUND_FILES = {
  click: require('../../assets/sounds/click.wav'),
  correct: require('../../assets/sounds/correct.wav'),
  wrong: require('../../assets/sounds/wrong.wav'),
  win: require('../../assets/sounds/win.wav'),
} as const;

export type SoundName = keyof typeof SOUND_FILES;

const players: Partial<Record<SoundName, AudioPlayer>> = {};
let configured = false;

function ensureConfigured() {
  if (configured) return;
  configured = true;
  // Play over the ringer/silent switch (games are expected to have sound
  // regardless of that toggle) without stealing focus from other audio.
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
}

function getPlayer(name: SoundName): AudioPlayer {
  let player = players[name];
  if (!player) {
    player = createAudioPlayer(SOUND_FILES[name]);
    players[name] = player;
  }
  return player;
}

/**
 * Fire-and-forget short sound effect. Safe to call rapidly (keypad taps,
 * tile swaps) — reuses one player per sound and seeks to 0 before each play,
 * since expo-audio doesn't reset position automatically on finish. Wrapped
 * so a playback glitch never interrupts actual gameplay.
 */
export function playSound(name: SoundName) {
  ensureConfigured();
  try {
    const player = getPlayer(name);
    player.seekTo(0);
    player.play();
  } catch {
    // no-op — sound is a nice-to-have, never worth crashing a game screen over
  }
}
