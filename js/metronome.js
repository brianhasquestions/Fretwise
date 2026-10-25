/* Metronome: a look-ahead Web Audio scheduler (sample-accurate clicks) with a small control strip.
   Clicks are filtered noise rather than tones so the pitch detector never mistakes them for notes. */
const Metronome = (() => {
  'use strict';

  const KEY = 'fw.metro';
  const state = Object.assign({ bpm: 90, beats: 4, sub: 1, accent: true, volume: 0.8, tab: 'metro' }, load());
  const LOOKAHEAD = 0.12; // seconds scheduled ahead of the audio clock

  let ctx = null;
  let out = null;
  let noise = null;
  let timer = null;
  let tick = 0;
  let nextTime = 0;
  let running = false;
  const queue = [];       // scheduled ticks waiting to be shown
  const clickTimes = [];  // recent click times (for the pitch detector)
  const taps = [];
  let el = null;
  let refs = {};

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ }
  }

  // ---------- Audio ----------

  function ensureAudio() {
    ctx = Sound.init();
    if (!ctx) return false;
    if (!out) {
      out = ctx.createGain();
      out.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.05);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    out.gain.value = state.volume;
    return true;
  }

  function click(t, level) { // level 2 = accent, 1 = beat, 0 = subdivision
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = [1500, 2300, 3300][level];
    bp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime([0.8, 1.8, 2.8][level], t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.05);
  }

  function schedule() {
    const spt = 60 / state.bpm / state.sub; // seconds per tick
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      const isBeat = tick % state.sub === 0;
      const beat = Math.floor(tick / state.sub) % state.beats;
      const level = isBeat ? (beat === 0 && state.accent && state.beats > 1 ? 2 : 1) : 0;
      click(nextTime, level);
      queue.push({ time: nextTime, beat, isBeat });
      clickTimes.push(nextTime);
      nextTime += spt;
      tick++;
    }
    while (clickTimes.length && clickTimes[0] < ctx.currentTime - 1) clickTimes.shift();
    draw();
  }

  function start() {
    if (running || !ensureAudio()) return;
    if (typeof Jam !== 'undefined' && Jam.isRunning()) Jam.stop(); // one rhythm source at a time
    running = true;
    tick = 0;
    nextTime = ctx.currentTime + 0.08;
    schedule();
    timer = setInterval(schedule, 25); // also drives the beat lights (rAF stalls in background tabs)
    render();
  }

  function stop() {
    running = false;
    clearInterval(timer);
    queue.length = 0;
    render();
  }

  const toggle = () => (running ? stop() : start());

  // ---------- Visuals ----------

  function draw() {
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const q = queue.shift();
      if (q.isBeat) {
        refs.beats.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === q.beat));
        const btn = document.getElementById('metro-btn');
        if (btn) { btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); }
      }
    }
  }

  function setBpm(v) {
    state.bpm = Math.max(30, Math.min(260, Math.round(v)));
    save();
    render();
  }

  function tap() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      setBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
    }
  }

  function build() {
    el = document.getElementById('metronome');
    const h = (tag, props = {}, ...kids) => {
      const n = document.createElement(tag);
      Object.entries(props).forEach(([k, v]) => {
        if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
        else if (k === 'class') n.className = v;
        else n.setAttribute(k, v);
      });
      kids.forEach(k => n.append(k));
      return n;
    };
    const opts = (sel, list, value) => {
      list.forEach(([v, label]) => {
        const o = h('option', { value: v }, label);
        if (String(v) === String(value)) o.selected = true;
        sel.append(o);
      });
      return sel;
    };
    refs.play = h('button', { type: 'button', class: 'btn primary metro-play', onclick: toggle });
    refs.bpm = h('output', { class: 'metro-bpm-value' });
    refs.slider = h('input', { type: 'range', min: 30, max: 260, 'aria-label': 'Tempo', oninput: e => setBpm(+e.target.value) });
    refs.beats = h('div', { class: 'metro-beats', 'aria-hidden': 'true' });
    refs.meter = opts(h('select', { 'aria-label': 'Beats per bar', onchange: e => { state.beats = +e.target.value; save(); render(); } }),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(n => [n, `${n} beat${n > 1 ? 's' : ''}/bar`]), state.beats);
    refs.sub = opts(h('select', {
      'aria-label': 'Subdivision',
      onchange: e => {
        const next = +e.target.value;
        tick = Math.round(tick / state.sub) * next;
        state.sub = next;
        save();
      },
    }), [[1, 'Quarter notes'], [2, 'Eighths'], [3, 'Triplets'], [4, 'Sixteenths']], state.sub);
    refs.accent = h('input', { type: 'checkbox', onchange: e => { state.accent = e.target.checked; save(); } });
    refs.volume = h('input', { type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': 'Metronome volume', oninput: e => { state.volume = +e.target.value; if (out) out.gain.value = state.volume; save(); } });

    // Two tabs share the strip: the click track and the jam-track band.
    refs.tabs = h('div', { class: 'segmented metro-tabs', role: 'tablist' });
    refs.metroPane = h('div', { class: 'metro-pane' });
    refs.jamPane = h('div', { class: 'jam-pane' });
    const tabBtn = (id, label) => h('button', { type: 'button', class: 'seg', role: 'tab', 'data-tab': id, onclick: () => showTab(id) }, label);
    refs.tabs.append(tabBtn('metro', 'Metronome'), tabBtn('jam', 'Jam tracks'));
    el.append(
      h('div', { class: 'metro-head' }, refs.tabs,
        h('button', { type: 'button', class: 'icon-btn metro-close', 'aria-label': 'Hide metronome', onclick: () => setVisible(false) }, '✕')),
      refs.metroPane,
      refs.jamPane,
    );
    if (typeof Jam !== 'undefined') Jam.mount(refs.jamPane);
    refs.metroPane.append(
      refs.play,
      h('div', { class: 'metro-tempo' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slower', onclick: () => setBpm(state.bpm - 1) }, '−'),
        h('div', { class: 'metro-bpm' }, refs.bpm, h('span', {}, 'BPM')),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Faster', onclick: () => setBpm(state.bpm + 1) }, '+')),
      refs.slider,
      h('button', { type: 'button', class: 'btn', onclick: tap, title: 'Tap a few times to set the tempo' }, 'Tap'),
      refs.meter,
      refs.sub,
      h('label', { class: 'toggle' }, refs.accent, 'Accent beat 1'),
      h('label', { class: 'ctl' }, h('span', {}, 'Vol'), refs.volume),
      refs.beats,
    );
    showTab(state.tab);
    refs.accent.checked = state.accent;
    refs.volume.value = state.volume;
    render();
  }

  function render() {
    if (!el) return;
    refs.play.textContent = running ? '■ Stop' : '▶ Start';
    refs.play.setAttribute('aria-pressed', String(running));
    refs.bpm.textContent = state.bpm;
    refs.slider.value = state.bpm;
    if (refs.beats.children.length !== state.beats) {
      refs.beats.replaceChildren(...Array.from({ length: state.beats }, (_, i) => {
        const d = document.createElement('i');
        if (i === 0) d.className = 'first';
        return d;
      }));
    }
    if (!running) refs.beats.querySelectorAll('i').forEach(d => d.classList.remove('on'));
    const btn = document.getElementById('metro-btn');
    if (btn) btn.classList.toggle('is-running', running);
  }

  function showTab(id) {
    if (!el) build();
    state.tab = id === 'jam' ? 'jam' : 'metro';
    save();
    refs.metroPane.hidden = state.tab !== 'metro';
    refs.jamPane.hidden = state.tab !== 'jam';
    refs.tabs.querySelectorAll('.seg').forEach(b => {
      const on = b.dataset.tab === state.tab;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  function setVisible(on) {
    if (!el) build();
    el.hidden = !on;
    const btn = document.getElementById('metro-btn');
    if (btn) btn.setAttribute('aria-expanded', String(on));
  }

  return {
    toggleVisible() { if (!el) build(); setVisible(el.hidden); },
    show() { setVisible(true); },
    showTab(id) { setVisible(true); showTab(id); },
    start,
    stop,
    toggle,
    isRunning: () => running,
    /** True if a click sounded within the last `within` seconds. */
    recentClick(within = 0.08) {
      if (!running || !ctx) return false;
      const now = ctx.currentTime;
      return clickTimes.some(t => now - t >= -0.005 && now - t < within);
    },
  };
})();
