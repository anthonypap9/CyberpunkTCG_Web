// Tiny WebAudio synth: no audio files needed.
let ctx = null, muted = false, master = null, sfxVol = 0.8;
export const setMuted = (m) => { muted = m; };
export const setSfxVolume = (v) => { sfxVol = Math.max(0, Math.min(1, v)); if (master) master.gain.value = sfxVol; };
function out(c) { if (!master) { master = c.createGain(); master.gain.value = sfxVol; master.connect(c.destination); } return master; }
function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, t0, dur, type = 'sine', vol = 0.12, slideTo = null) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + t0 + dur);
  g.gain.setValueAtTime(0.0001, c.currentTime + t0);
  g.gain.exponentialRampToValueAtTime(vol, c.currentTime + t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + dur);
  o.connect(g).connect(out(c)); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + 0.02);
}
function noise(t0, dur, vol = 0.1) {
  const c = ac(); if (!c) return;
  const n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = vol;
  s.connect(g).connect(out(c)); s.start(c.currentTime + t0);
}
const SOUNDS = {
  tick: () => tone(880, 0, 0.04, 'square', 0.04),
  tap: () => { tone(520, 0, 0.07, 'triangle', 0.1); tone(780, 0.05, 0.08, 'triangle', 0.08); },
  nope: () => tone(160, 0, 0.18, 'sawtooth', 0.08, 110),
  roll: () => { for (let i = 0; i < 7; i++) noise(i * 0.07, 0.05, 0.06); tone(660, 0.5, 0.12, 'triangle', 0.1); },
  hit: () => { noise(0, 0.12, 0.12); tone(140, 0, 0.15, 'square', 0.08, 70); },
  steal: () => { tone(700, 0, 0.1, 'sawtooth', 0.07, 300); tone(300, 0.1, 0.15, 'sawtooth', 0.07, 600); },
  boom: () => { noise(0, 0.3, 0.16); tone(90, 0, 0.3, 'sawtooth', 0.1, 40); },
  call: () => { tone(440, 0, 0.1, 'triangle'); tone(660, 0.1, 0.1, 'triangle'); tone(880, 0.2, 0.16, 'triangle'); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.25, 'triangle', 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.16, 0.3, 'sawtooth', 0.07)),
};
export function sfx(name) { if (muted) return; try { SOUNDS[name]?.(); } catch { /* audio unavailable */ } }
