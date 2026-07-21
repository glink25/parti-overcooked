const STORAGE_KEY = 'overcooked-party:muted';

const MODE = {
  lobby: { bpm: 96, length: 64 },
  countdown: { bpm: 112, length: 16 },
  playing: { bpm: 124, length: 64 },
  urgent: { bpm: 140, length: 64 },
  awards: { bpm: 108, length: 64 },
};

const MIDI = (note) => 440 * 2 ** ((note - 69) / 12);

export function musicModeFor(phase, timeLeft = 0) {
  if (phase === 'lobby') return 'lobby';
  if (phase === 'countdown') return 'countdown';
  if (phase === 'playing') return timeLeft > 0 && timeLeft <= 30 ? 'urgent' : 'playing';
  if (phase === 'roundResult') return 'lobby';
  if (phase === 'awards') return 'awards';
  return null;
}

export function potWarningLevel(readySeconds = 0) {
  if (readySeconds >= 8) return 'critical';
  if (readySeconds >= 4) return 'warning';
  return null;
}

export function orderWarningLevel(timeLeft = 0) {
  if (timeLeft > 0 && timeLeft <= 8) return 'critical';
  if (timeLeft > 0 && timeLeft <= 20) return 'warning';
  return null;
}

function readMuted() {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function writeMuted(value) {
  try { sessionStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* memory-only fallback */ }
}

export function createAudioEngine() {
  let ctx = null;
  let master = null;
  let musicBus = null;
  let sfxBus = null;
  let timer = null;
  let mode = null;
  let desiredMode = null;
  let musicStep = 0;
  let nextStepTime = 0;
  let noiseBuffer = null;
  let muted = readMuted();
  let inactive = typeof document !== 'undefined' && document.hidden;
  let destroyed = false;
  const musicSources = new Set();
  const lastSfxAt = new Map();

  function makeGraph() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor || ctx) return !!ctx;
    try {
      ctx = new AudioCtor();
      master = ctx.createGain();
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.006;
      compressor.release.value = 0.18;
      master.gain.value = muted ? 0 : 0.72;
      musicBus.gain.value = 0.34;
      sfxBus.gain.value = 0.86;
      musicBus.connect(master);
      sfxBus.connect(master);
      master.connect(compressor).connect(ctx.destination);
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function track(source, isMusic) {
    if (!isMusic) return;
    musicSources.add(source);
    source.addEventListener('ended', () => musicSources.delete(source), { once: true });
  }

  function tone(freq, at, duration, options = {}) {
    if (!ctx) return;
    const {
      type = 'triangle', volume = 0.12, attack = 0.008,
      destination = sfxBus, music = false, detune = 0,
    } = options;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), at);
    osc.detune.value = detune;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(destination);
    track(osc, music);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  function sweep(from, to, at, duration, options = {}) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type || 'sine';
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + duration);
    gain.gain.setValueAtTime(options.volume || 0.12, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain).connect(options.destination || sfxBus);
    track(osc, !!options.music);
    osc.start(at);
    osc.stop(at + duration + 0.03);
  }

  function getNoiseBuffer() {
    if (noiseBuffer || !ctx) return noiseBuffer;
    const length = Math.ceil(ctx.sampleRate * 0.35);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function noise(at, duration, options = {}) {
    if (!ctx) return;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = getNoiseBuffer();
    filter.type = options.filter || 'highpass';
    filter.frequency.value = options.frequency || 4000;
    gain.gain.setValueAtTime(options.volume || 0.04, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    source.connect(filter).connect(gain).connect(options.destination || sfxBus);
    track(source, !!options.music);
    source.start(at);
    source.stop(at + duration);
  }

  function stopMusicSources() {
    for (const source of musicSources) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    musicSources.clear();
  }

  function scheduleKick(at, volume = 0.08) {
    sweep(125, 43, at, 0.13, { volume, destination: musicBus, music: true });
  }

  function scheduleMusicStep(at, step) {
    const cfg = MODE[mode];
    if (!cfg) return;
    const bar = Math.floor(step / 16) % 4;
    const inBar = step % 16;
    const roots = [60, 57, 53, 55]; // C, Am, F, G
    const chord = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]][bar];
    const root = roots[bar];

    if (mode === 'lobby') {
      if (inBar % 4 === 0) {
        const degree = chord[(inBar / 4) % chord.length];
        tone(MIDI(root + 12 + degree), at, 0.28, { volume: 0.045, destination: musicBus, music: true });
      }
      if (inBar === 0 || inBar === 8) tone(MIDI(root - 12), at, 0.34, { type: 'sine', volume: 0.035, destination: musicBus, music: true });
      if (inBar === 6 || inBar === 14) noise(at, 0.045, { volume: 0.012, destination: musicBus, music: true });
      return;
    }

    if (mode === 'countdown') {
      if (inBar % 4 === 0) {
        const note = [60, 64, 67, 72][inBar / 4];
        tone(MIDI(note + 12), at, 0.16, { volume: 0.055, destination: musicBus, music: true });
        scheduleKick(at, 0.045 + inBar * 0.002);
      }
      noise(at, 0.025, { volume: 0.008 + inBar * 0.0007, destination: musicBus, music: true });
      return;
    }

    const urgent = mode === 'urgent';
    if (inBar % 4 === 0) {
      const beat = inBar / 4;
      const bassNote = root - 12 + (beat % 2 ? 7 : 0);
      tone(MIDI(bassNote), at, 0.18, { type: 'square', volume: 0.032, destination: musicBus, music: true });
    }
    if (inBar % 2 === 0) {
      const pattern = [0, 7, 4, 7, 12, 7, 4, 7];
      tone(MIDI(root + 12 + pattern[inBar / 2]), at, 0.1, { volume: urgent ? 0.052 : 0.044, destination: musicBus, music: true });
    }
    if (inBar === 0 || inBar === 8 || (urgent && (inBar === 6 || inBar === 14))) scheduleKick(at, urgent ? 0.09 : 0.075);
    if (inBar === 4 || inBar === 12) noise(at, 0.09, { filter: 'bandpass', frequency: 1500, volume: 0.032, destination: musicBus, music: true });
    if (inBar % 2 === 1) noise(at, 0.035, { volume: urgent ? 0.026 : 0.017, destination: musicBus, music: true });
    if (urgent && inBar % 4 === 2) tone(MIDI(84), at, 0.035, { type: 'square', volume: 0.012, destination: musicBus, music: true });
  }

  function scheduler() {
    if (!ctx || !mode || muted || inactive || destroyed) return;
    const cfg = MODE[mode];
    const stepDuration = 60 / cfg.bpm / 4;
    while (nextStepTime < ctx.currentTime + 0.45) {
      scheduleMusicStep(nextStepTime, musicStep);
      nextStepTime += stepDuration;
      musicStep = (musicStep + 1) % cfg.length;
    }
  }

  function stopScheduler() {
    if (timer) clearInterval(timer);
    timer = null;
    stopMusicSources();
  }

  function startDesiredMusic() {
    if (!ctx || muted || inactive || !desiredMode || destroyed) return;
    mode = desiredMode;
    musicStep = 0;
    nextStepTime = ctx.currentTime + 0.07;
    if (!timer) timer = setInterval(scheduler, 80);
    scheduler();
  }

  function switchMusic(nextMode) {
    desiredMode = nextMode;
    if (mode === nextMode && timer) return;
    stopScheduler();
    mode = null;
    startDesiredMusic();
  }

  async function unlock() {
    if (destroyed || muted || !makeGraph()) return false;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      startDesiredMusic();
      return ctx.state === 'running';
    } catch { return false; }
  }

  function setMuted(value) {
    muted = !!value;
    writeMuted(muted);
    if (!ctx && !muted) makeGraph();
    if (ctx && master) {
      const at = ctx.currentTime;
      master.gain.cancelScheduledValues(at);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), at);
      master.gain.linearRampToValueAtTime(muted ? 0.0001 : 0.72, at + 0.08);
    }
    if (muted) stopScheduler();
    else unlock();
    return muted;
  }

  function setGameState(phase, timeLeft = 0) {
    switchMusic(musicModeFor(phase, timeLeft));
  }

  function playSfx(name) {
    if (muted || inactive || destroyed || !makeGraph()) return;
    if (ctx.state === 'suspended') return;
    const nowMs = performance.now();
    const cooldowns = { chop: 150, wash: 190, potBubble: 700, potBubbleUrgent: 380, orderHurry: 3000, orderCritical: 1600 };
    const cooldown = cooldowns[name] || 0;
    if (cooldown && nowMs - (lastSfxAt.get(name) || 0) < cooldown) return;
    lastSfxAt.set(name, nowMs);
    const t = ctx.currentTime + 0.008;
    const notes = (values, gap = 0.07, duration = 0.11, volume = 0.12, type = 'triangle') => {
      values.forEach((m, i) => tone(MIDI(m), t + i * gap, duration, { volume, type }));
    };
    switch (name) {
      case 'ui': tone(760, t, 0.045, { volume: 0.055 }); break;
      case 'countdown': tone(660, t, 0.09, { type: 'square', volume: 0.07 }); break;
      case 'pickup': sweep(390, 690, t, 0.08, { volume: 0.08, type: 'triangle' }); break;
      case 'place': sweep(560, 330, t, 0.075, { volume: 0.065, type: 'triangle' }); break;
      case 'potDrop': tone(260, t, 0.08, { type: 'sine', volume: 0.09 }); noise(t, 0.08, { filter: 'bandpass', frequency: 900, volume: 0.045 }); break;
      case 'trash': sweep(270, 90, t, 0.18, { type: 'sawtooth', volume: 0.055 }); break;
      case 'dishReady': notes([67, 72], 0.065, 0.1, 0.075); break;
      case 'chop': noise(t, 0.035, { filter: 'bandpass', frequency: 2100, volume: 0.07 }); tone(185, t, 0.035, { type: 'square', volume: 0.035 }); break;
      case 'wash': noise(t, 0.13, { filter: 'bandpass', frequency: 1050, volume: 0.035 }); sweep(520, 760, t, 0.11, { volume: 0.028 }); break;
      case 'workDone': notes([72, 79], 0.075, 0.13, 0.085); break;
      case 'orderNew': notes([81, 88], 0.09, 0.14, 0.095); break;
      case 'served': notes([72, 76, 79, 84], 0.065, 0.16, 0.105); break;
      case 'expired': notes([55, 51], 0.14, 0.24, 0.075, 'sawtooth'); break;
      case 'potReady': notes([83, 88], 0.1, 0.18, 0.085, 'sine'); break;
      case 'potBubble':
        sweep(105, 185, t, 0.18, { volume: 0.052 });
        sweep(125, 220, t + 0.12, 0.14, { volume: 0.038 });
        noise(t, 0.24, { filter: 'bandpass', frequency: 620, volume: 0.016 });
        break;
      case 'potBubbleUrgent':
        for (let i = 0; i < 3; i++) sweep(115 + i * 18, 230 + i * 25, t + i * 0.09, 0.13, { volume: 0.052 });
        noise(t, 0.31, { filter: 'bandpass', frequency: 780, volume: 0.025 });
        break;
      case 'orderHurry':
        tone(1047, t, 0.32, { type: 'sine', volume: 0.075 });
        tone(2093, t, 0.22, { type: 'sine', volume: 0.026 });
        break;
      case 'orderCritical':
        [0, 0.18].forEach((delay) => {
          tone(1175, t + delay, 0.28, { type: 'sine', volume: 0.082 });
          tone(2350, t + delay, 0.18, { type: 'sine', volume: 0.028 });
        });
        break;
      case 'burnt': for (let i = 0; i < 3; i++) tone(225, t + i * 0.16, 0.11, { type: 'square', volume: 0.07 }); break;
      case 'dirty': notes([64, 59], 0.07, 0.08, 0.055, 'square'); break;
      case 'gateWarning': for(let i=0;i<3;i++)tone(610+i*70,t+i*.12,.08,{type:'square',volume:.065}); break;
      case 'start': notes([60, 67, 72, 79], 0.075, 0.18, 0.105); break;
      case 'over': notes([72, 76, 79, 84], 0.14, 0.32, 0.085); break;
      case 'join': notes([72, 76], 0.07, 0.11, 0.065, 'sine'); break;
      default: break;
    }
  }

  function onVisibilityChange() {
    inactive = document.hidden || !document.hasFocus();
    if (inactive) stopScheduler();
    else unlock();
  }

  function onWindowBlur() {
    inactive = true;
    stopScheduler();
  }

  function onWindowFocus() {
    inactive = document.hidden;
    if (!inactive) unlock();
  }

  function destroy() {
    destroyed = true;
    stopScheduler();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('blur', onWindowBlur);
    window.removeEventListener('focus', onWindowFocus);
    if (ctx) ctx.close().catch(() => {});
    ctx = null;
  }

  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('focus', onWindowFocus);
  }

  return {
    unlock,
    setMuted,
    setGameState,
    playSfx,
    destroy,
    isMuted: () => muted,
  };
}
