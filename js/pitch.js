/* Microphone pitch detection (YIN) shared by the tuner and "answer by playing".
   Frames are published ~25 times a second as { rms, freq, clarity, midi } (freq null when unsure). */
const Pitch = (() => {
  'use strict';

  const MIN_FREQ = 55;    // a little below B1, the lowest open string we support
  const MAX_FREQ = 1400;  // above the 24th fret of the high E string
  const WINDOW = 2048;

  let ctx = null;
  let stream = null;
  let source = null;
  let analyser = null;
  let buf = null;
  let timer = null;
  let gate = 0.012;       // RMS below this is treated as silence
  let a4 = 440;
  let starting = null;
  const users = new Set();
  const listeners = new Set();

  const supported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  /** Start listening on behalf of `who` (the mic stays on while anyone needs it). */
  async function acquire(who) {
    users.add(who);
    if (stream) return;
    if (!starting) starting = open().finally(() => { starting = null; });
    try {
      await starting;
    } catch (err) {
      users.delete(who);
      throw err;
    }
  }

  function release(who) {
    users.delete(who);
    if (!users.size) close();
  }

  async function open() {
    if (!supported()) {
      throw new Error(window.isSecureContext === false
        ? 'The microphone needs a secure page. Open the app from http://localhost (or https) instead.'
        : "This browser doesn't support microphone input.");
    }
    ctx = Sound.init();
    if (!ctx) throw new Error('Web Audio is not available in this browser.');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (!users.size) { close(); return; } // released while the permission prompt was open
    source = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    buf = new Float32Array(analyser.fftSize);
    timer = setInterval(tick, 40);
  }

  function close() {
    clearInterval(timer);
    timer = null;
    if (source) source.disconnect();
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = source = analyser = null;
  }

  function tick() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = buf.length - WINDOW; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / WINDOW);
    let frame = { rms, freq: null, clarity: 0, midi: null, time: ctx.currentTime };
    if (rms >= gate) {
      const r = yin(buf, ctx.sampleRate);
      if (r) frame = { ...frame, freq: r.freq, clarity: r.clarity, midi: 69 + 12 * Math.log2(r.freq / a4) };
    }
    listeners.forEach(fn => fn(frame));
  }

  /** YIN fundamental-frequency estimate over the most recent samples. */
  function yin(data, sr) {
    const maxTau = Math.min(Math.floor(sr / MIN_FREQ), data.length - WINDOW - 1);
    const minTau = Math.max(2, Math.floor(sr / MAX_FREQ));
    const start = data.length - WINDOW - maxTau;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      for (let j = 0; j < WINDOW; j++) {
        const diff = data[start + j] - data[start + j + tau];
        sum += diff * diff;
      }
      d[tau] = sum;
    }
    // Cumulative mean normalised difference.
    let running = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++) {
      running += d[tau];
      d[tau] = running ? (d[tau] * tau) / running : 1;
    }
    const threshold = 0.15;
    let tau = -1;
    for (let t = minTau; t <= maxTau; t++) {
      if (d[t] < threshold) {
        while (t + 1 <= maxTau && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;
    // Parabolic interpolation for sub-sample accuracy.
    const x0 = d[tau - 1];
    const x1 = d[tau];
    const x2 = tau + 1 <= maxTau ? d[tau + 1] : x1;
    const denom = x0 + x2 - 2 * x1;
    const better = denom ? tau + (x0 - x2) / (2 * denom) : tau;
    return { freq: sr / better, clarity: 1 - x1 };
  }

  /** Turn frames into discrete note events: a note fires once it is stable for a few frames,
      and again only after silence, a new pick attack, or a change of pitch. */
  function createNoteDetector(onNote, { frames = 3, isNoisy = () => false } = {}) {
    let cand = null;
    let count = 0;
    let armed = true;
    let last = null;
    let lastRms = 0;
    let quiet = 0;
    const detect = frame => {
      if (frame.midi == null || frame.clarity < 0.85) {
        if (frame.rms < gate * 1.2 && ++quiet >= 2) { armed = true; last = null; }
        cand = null;
        count = 0;
        lastRms = frame.rms;
        return;
      }
      quiet = 0;
      const midi = Math.round(frame.midi);
      if (frame.rms > lastRms * 1.8 && frame.rms > gate * 2 && !isNoisy()) armed = true; // re-picked
      lastRms = frame.rms;
      if (midi === cand) count++;
      else { cand = midi; count = 1; }
      if (count >= frames && (armed || midi !== last)) {
        armed = false;
        last = midi;
        onNote(midi, frame);
      }
    };
    detect.reset = () => { cand = null; count = 0; armed = true; last = null; };
    return detect;
  }

  return {
    supported,
    acquire,
    release,
    isOn: () => !!stream,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    createNoteDetector,
    /** Sensitivity 1 (needs a loud signal) … 10 (picks up quiet playing). */
    setSensitivity(n) { gate = 0.002 + (10 - n) * 0.004; },
    setA4(hz) { a4 = hz; },
    getA4: () => a4,
  };
})();
