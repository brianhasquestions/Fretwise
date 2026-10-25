/* Plucked-string synth (Karplus–Strong) built on the Web Audio API.
   Each MIDI note is rendered once per tone into an AudioBuffer and cached. */
const Sound = (() => {
  'use strict';

  let ctx = null;
  let out = null;
  let enabled = true;
  let volume = 0.8;
  const buffers = new Map();
  const voices = new Map();
  const active = new Set(); // every scheduled source, so runs can be cancelled
  let maxDur = null;        // when set (mic mode), notes are cut short so the mic is free again quickly
  let busyUntil = 0;        // context time until which our own notes are sounding

  // Tone presets. String model: noise brightness (low → high strings), loop damping weight (lower =
  // brighter and longer), pick position, sustain multiplier. Output: body EQ, treble shelf, drive.
  const TONES = {
    acoustic: { name: 'Acoustic (steel string)', bright: [0.35, 0.75], weight: 0.5, pick: 0.14, sustain: 1, body: [180, 4], shelf: -4, drive: 0 },
    nylon: { name: 'Classical (nylon string)', bright: [0.16, 0.42], weight: 0.5, pick: 0.22, sustain: 0.85, body: [140, 6], shelf: -10, drive: 0 },
    electric: { name: 'Electric (clean)', bright: [0.55, 0.9], weight: 0.38, pick: 0.09, sustain: 1.5, body: [600, 1.5], shelf: 1, drive: 0 },
    overdrive: { name: 'Electric (overdrive)', bright: [0.55, 0.9], weight: 0.38, pick: 0.09, sustain: 1.9, body: [700, 3], shelf: -2, drive: 14 },
    muted: { name: 'Palm-muted', bright: [0.14, 0.28], weight: 0.5, pick: 0.12, sustain: 0.11, body: [150, 6], shelf: -12, drive: 0 },
    // Bright electric through a fast tape echo — the 1950s "slapback" sound Les Paul made famous.
    slapback: { name: 'Electric (1950s slapback echo)', bright: [0.6, 0.95], weight: 0.36, pick: 0.08, sustain: 1.3, body: [900, 2], shelf: 3, drive: 0, echo: [0.11, 0.3, 0.42] },
  };
  let tone = TONES.acoustic;
  let toneId = 'acoustic';
  let nodes = null;

  function softClip(amount) {
    const n = 2048;
    const curve = new Float32Array(n);
    const k = Math.tanh(amount);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / k;
    }
    return curve;
  }

  function applyTone() {
    if (!nodes) return;
    const t = ctx.currentTime;
    nodes.body.frequency.setValueAtTime(tone.body[0], t);
    nodes.body.gain.setValueAtTime(tone.body[1], t);
    nodes.air.gain.setValueAtTime(tone.shelf, t);
    // Echo: [delay seconds, feedback, wet level]; a lowpass in the loop darkens each repeat like tape.
    const [time, feedback, wet] = tone.echo || [0.11, 0, 0];
    nodes.delay.delayTime.setValueAtTime(time, t);
    nodes.echoFb.gain.setValueAtTime(feedback, t);
    nodes.echoWet.gain.setValueAtTime(wet, t);
    if (tone.drive) {
      nodes.pre.gain.setValueAtTime(tone.drive, t);
      nodes.shaper.curve = softClip(1.6);
      nodes.cab.frequency.setValueAtTime(4200, t); // speaker-cabinet roll-off
      nodes.post.gain.setValueAtTime(0.32, t);
    } else {
      nodes.pre.gain.setValueAtTime(1, t);
      nodes.shaper.curve = null;
      nodes.cab.frequency.setValueAtTime(18000, t);
      nodes.post.gain.setValueAtTime(1, t);
    }
  }

  function init() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      out = ctx.createGain();
      out.gain.value = volume;
      const body = ctx.createBiquadFilter(); // instrument "body" resonance
      body.type = 'peaking';
      body.Q.value = 0.9;
      const air = ctx.createBiquadFilter();
      air.type = 'highshelf';
      air.frequency.value = 4000;
      const pre = ctx.createGain();         // drive stage (bypassed for clean tones)
      const shaper = ctx.createWaveShaper();
      shaper.oversample = '4x';
      const cab = ctx.createBiquadFilter();
      cab.type = 'lowpass';
      cab.Q.value = 0.7;
      const post = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      out.connect(body).connect(air).connect(pre).connect(shaper).connect(cab).connect(post).connect(comp).connect(ctx.destination);
      const delay = ctx.createDelay(1);   // echo send (silent unless the tone uses it)
      const echoTone = ctx.createBiquadFilter();
      echoTone.type = 'lowpass';
      echoTone.frequency.value = 3200;
      const echoFb = ctx.createGain();
      const echoWet = ctx.createGain();
      post.connect(delay);
      delay.connect(echoTone);
      echoTone.connect(echoFb).connect(delay);
      echoTone.connect(echoWet).connect(comp);
      nodes = { body, air, pre, shaper, cab, post, delay, echoFb, echoWet };
      applyTone();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function render(midi) {
    const sr = ctx.sampleRate;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    // The loop blends the sample from N steps ago with the one from N-1 steps ago (weight w), so the
    // effective loop delay is N - w samples. Residual tuning is corrected with playbackRate.
    const w = tone.weight;
    const N = Math.max(2, Math.round(sr / freq + w));
    const loopFreq = sr / (N - w);
    const rate = freq / loopFreq;
    const t60 = Math.max(0.25, Math.max(1.3, 4.2 - (midi - 40) * 0.07) * tone.sustain); // low strings ring longer
    const rho = Math.pow(0.001, 1 / (t60 * loopFreq));
    const len = Math.floor(sr * Math.min(4.5, t60));

    // Excitation: softened noise burst with a pick-position comb.
    const noise = new Float32Array(N);
    const [b0, b1] = tone.bright;
    const bright = b0 + (b1 - b0) * Math.min(1, Math.max(0, (midi - 40) / 40));
    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      lp += bright * ((Math.random() * 2 - 1) - lp);
      noise[i] = lp;
      mean += lp;
    }
    mean /= N;
    const P = Math.max(1, Math.round(N * tone.pick));
    const line = new Float32Array(N);
    for (let i = 0; i < N; i++) line[i] = (noise[i] - mean) - (i >= P ? noise[i - P] - mean : 0);

    const buffer = ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);
    let idx = 0;
    let peak = 0;
    for (let n = 0; n < len; n++) {
      const next = idx + 1 === N ? 0 : idx + 1;
      const a = line[idx];
      data[n] = a;
      line[idx] = rho * ((1 - w) * a + w * line[next]);
      idx = next;
      const abs = a < 0 ? -a : a;
      if (abs > peak) peak = abs;
    }

    const gain = 0.55 / (peak || 1);
    const fadeIn = Math.floor(sr * 0.003);
    const fadeOut = Math.floor(Math.min(sr * 0.3, len * 0.4));
    for (let n = 0; n < len; n++) {
      let e = gain;
      if (n < fadeIn) e *= n / fadeIn;
      if (n > len - fadeOut) e *= (len - n) / fadeOut;
      data[n] *= e;
    }
    return { buffer, rate };
  }

  function stop(key, at) {
    const v = voices.get(key);
    if (!v || !ctx) return;
    const t = Math.max(at ?? 0, ctx.currentTime);
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.04);
      v.src.stop(t + 0.05);
    } catch (_) { /* already stopped */ }
    voices.delete(key);
  }

  /** Play a MIDI note. `key` identifies a voice (e.g. a string) so a new note cuts the old one;
      `dur` (seconds) damps the note early, for staccato strums. */
  function play(midi, { key, when = 0, gain = 1, dur: length } = {}) {
    if (!enabled) return;
    const c = init();
    if (!c) return;
    const cacheKey = toneId + ':' + midi;
    let entry = buffers.get(cacheKey);
    if (!entry) { entry = render(midi); buffers.set(cacheKey, entry); }
    const t = c.currentTime + 0.01 + when;
    if (key) stop(key, t);
    const src = c.createBufferSource();
    src.buffer = entry.buffer;
    src.playbackRate.value = entry.rate;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g).connect(out);
    src.start(t);
    const natural = entry.buffer.duration / entry.rate;
    let dur = maxDur ? Math.min(natural, maxDur) : natural;
    if (length) dur = Math.min(dur, Math.max(0.03, length));
    if (dur < natural) {
      g.gain.setValueAtTime(gain, t + Math.max(0, dur - Math.min(0.08, dur / 2)));
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      src.stop(t + dur + 0.02);
    }
    busyUntil = Math.max(busyUntil, t + dur);
    const voice = { src, gain: g };
    active.add(voice);
    src.addEventListener('ended', () => active.delete(voice));
    if (key) {
      voices.set(key, voice);
      src.onended = () => { if (voices.get(key)?.src === src) voices.delete(key); };
    }
  }

  /** Strum notes low to high: [{ midi, key }]. `dur` damps the chord after that many seconds. */
  function strum(notes, gap = 0.045, when = 0, gain = 0.8, dur) {
    notes.forEach((n, i) => play(n.midi, { key: n.key, when: when + i * gap, gain, dur }));
  }

  function stopAll() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const v of active) {
      try {
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(v.gain.gain.value, t);
        v.gain.gain.linearRampToValueAtTime(0.0001, t + 0.04);
        v.src.stop(t + 0.05);
      } catch (_) { /* already stopped */ }
    }
    active.clear();
    voices.clear();
    busyUntil = Math.min(busyUntil, t + 0.06);
  }

  /** Play notes one after another: [{ midi, key }]. */
  function sequence(notes, gap = 0.17) {
    notes.forEach((n, i) => play(n.midi, { key: n.key, when: i * gap, gain: 0.9 }));
  }

  return {
    init,
    context: () => ctx,
    /** Cap note length in seconds (null for natural decay). */
    setMaxDuration(sec) { maxDur = sec; },
    /** True while one of our own notes is still sounding (plus `margin` seconds). */
    isBusy(margin = 0) { return !!ctx && ctx.currentTime < busyUntil + margin; },
    play,
    strum,
    sequence,
    stop,
    stopAll,
    setVolume(v) { volume = v; if (out) out.gain.value = v; },
    TONES,
    /** Switch the guitar sound ('acoustic', 'nylon', 'electric', 'overdrive', 'muted'). */
    setTone(id) {
      if (!TONES[id]) id = 'acoustic';
      toneId = id;
      tone = TONES[id];
      applyTone();
    },
    getTone: () => toneId,
    setEnabled(on) { enabled = on; if (!on) stopAll(); },
  };
})();
