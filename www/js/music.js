// Background music: plays www/music/* (listed in playlist.js) in shuffled order, with volume + mute.
import { PLAYLIST } from './playlist.js';

const st = { tracks: PLAYLIST.map((t) => ({ ...t, bad: false })), order: [], pos: -1, audio: null, volume: 0.4, muted: false, wanted: false, listeners: new Set() };
const emit = () => st.listeners.forEach((f) => f());
const alive = () => st.tracks.filter((t) => !t.bad);

function shuffle() {
  const idx = st.tracks.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  st.order = idx; st.pos = -1;
}
function load(step) {
  if (!alive().length) { emit(); return; }
  if (!st.order.length) shuffle();
  for (let n = 0; n < st.order.length; n++) {
    st.pos = (st.pos + step + st.order.length) % st.order.length;
    if (!st.tracks[st.order[st.pos]].bad) break;
  }
  const t = st.tracks[st.order[st.pos]];
  if (!st.audio) {
    st.audio = new Audio();
    st.audio.preload = 'auto';
    st.audio.addEventListener('ended', () => { load(1); play(); });
    st.audio.addEventListener('error', () => { const cur = st.tracks[st.order[st.pos]]; if (cur) cur.bad = true; load(1); play(); });
  }
  st.audio.src = encodeURI(t.file);
  st.audio.volume = st.volume;
  st.audio.muted = st.muted;
  emit();
}
function play() { if (st.audio && st.wanted && alive().length) st.audio.play().catch(() => { /* blocked until a tap */ }); }

export const music = {
  available: () => st.tracks.length > 0 && alive().length > 0,
  title: () => (st.audio && st.order.length ? st.tracks[st.order[st.pos]]?.title : '') || '',
  volume: () => st.volume,
  muted: () => st.muted,
  setVolume(v) { st.volume = Math.max(0, Math.min(1, v)); if (st.audio) st.audio.volume = st.volume; },
  setMuted(m) { st.muted = m; if (st.audio) st.audio.muted = m; emit(); },
  next() { st.wanted = true; load(1); play(); },
  prev() { st.wanted = true; load(-1); play(); },
  // call from the first user gesture (browsers block autoplay before that)
  start() { if (st.wanted) { play(); return; } st.wanted = true; if (!st.audio) load(1); play(); },
  on(f) { st.listeners.add(f); },
};
