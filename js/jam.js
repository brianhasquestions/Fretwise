/* Jam tracks: a synthesised backing band (drums, bass, rhythm guitar) in several styles, over a
   chord progression in any key. Shares the audio clock with the guitar synth and the metronome,
   and uses the same look-ahead scheduling as the metronome for steady timing.

   Patterns are written on a step grid: 16 steps per bar for straight feels, 12 (triplets) for
   shuffles and swing. Drum characters: X accent · x normal · g ghost · o open hi-hat · . rest. */
const Jam = (() => {
  'use strict';

  const KEY = 'fw.jam';
  const LOOKAHEAD = 0.15;

  // ---------- Progressions (scale degrees in semitones from the key) ----------

  const PROGRESSIONS = {
    blues12: { name: '12-bar blues', bars: [[0, '7'], [0, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
    quick12: { name: '12-bar blues (quick change)', bars: [[0, '7'], [5, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']] },
    minor12: { name: 'Minor blues', minor: true, bars: [[0, 'm7'], [0, 'm7'], [0, 'm7'], [0, 'm7'], [5, 'm7'], [5, 'm7'], [0, 'm7'], [0, 'm7'], [8, '7'], [7, '7'], [0, 'm7'], [7, '7']] },
    rock: { name: 'I – ♭VII – IV – I', bars: [[0, 'maj'], [10, 'maj'], [5, 'maj'], [0, 'maj']] },
    pop: { name: 'I – V – vi – IV', bars: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
    oneFourFive: { name: 'I – IV – V – IV', bars: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [5, 'maj']] },
    minorRock: { name: 'i – ♭VII – ♭VI – ♭VII', minor: true, bars: [[0, 'min'], [10, 'maj'], [8, 'maj'], [10, 'maj']] },
    andalusian: { name: 'i – ♭VII – ♭VI – V', minor: true, bars: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']] },
    funk: { name: 'i7 – IV7 vamp', minor: true, bars: [[0, 'm7'], [0, 'm7'], [5, '7'], [5, '7']] },
    reggae: { name: 'i – iv', minor: true, bars: [[0, 'min'], [0, 'min'], [5, 'min'], [5, 'min']] },
    twoFiveOne: { name: 'ii – V – I – VI', bars: [[2, 'm7'], [7, '7'], [0, 'maj7'], [9, '7']] },
    vamp: { name: 'One-chord vamp', bars: [[0, 'maj'], [0, 'maj']] },
    minorVamp: { name: 'One-chord vamp (minor)', minor: true, bars: [[0, 'min'], [0, 'min']] },
  };

  // ---------- Styles ----------
  // bass: [step, tone, length in steps]; tones: R 3 5 6 b7 7 8 (chord-aware) or A (approach the next chord)
  // comp: [step, gain, length in steps]; `top` keeps only the highest strings of the chord shape.
  // color: how plain chords are coloured — 'dom' (major → 7), 'jazz' (→ maj7 / m7), 'funk' (→ 7 / m7).

  const STYLES = {
    rock: {
      name: 'Rock', steps: 16, bpm: 112, prog: 'rock', scale: 'minpent',
      drums: { kick: 'x.......x.x.....', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.xo' },
      bass: [[0, 'R', 2], [2, 'R', 2], [4, 'R', 2], [6, 'R', 2], [8, 'R', 2], [10, 'R', 2], [12, 'R', 2], [14, '5', 2]],
      comp: [[0, 0.8, 6], [6, 0.55, 2], [8, 0.8, 6], [14, 0.55, 2]],
    },
    blues: {
      name: 'Blues shuffle', steps: 12, bpm: 96, prog: 'blues12', scale: 'blues', color: 'dom',
      drums: { kick: 'x.....x.....', snare: '...X.....X..', hat: 'x.xx.xx.xx.x' },
      bass: [[0, 'R', 2], [2, '3', 1], [3, '5', 2], [5, '6', 1], [6, 'b7', 2], [8, '6', 1], [9, '5', 2], [11, '3', 1]],
      comp: [[3, 0.6, 2], [9, 0.6, 2]],
    },
    slowblues: {
      name: 'Slow blues (12/8)', steps: 12, bpm: 58, prog: 'blues12', scale: 'blues', color: 'dom',
      drums: { kick: 'x.....x.....', snare: '...X.....X..', hat: 'xxxxxxxxxxxx' },
      bass: [[0, 'R', 3], [3, '5', 3], [6, '6', 3], [9, '5', 3]],
      comp: [[0, 0.6, 3], [3, 0.4, 3], [6, 0.55, 3], [9, 0.4, 3]],
    },
    funk: {
      name: 'Funk', steps: 16, bpm: 100, prog: 'funk', scale: 'minpent', color: 'funk',
      drums: { kick: 'x.x...x...x..x..', snare: '....X..g.g..X..g', hat: 'XxxxXxxxXxxxXxxo' },
      bass: [[0, 'R', 2], [3, 'R', 1], [6, '8', 1], [7, 'b7', 1], [10, 'R', 2], [13, '5', 1], [14, 'b7', 2]],
      comp: [[2, 0.55, 1], [6, 0.5, 1], [10, 0.55, 1], [13, 0.45, 1]],
      top: 4,
    },
    pop: {
      name: 'Pop', steps: 16, bpm: 100, prog: 'pop', scale: 'majpent',
      drums: { kick: 'x.....x.x.......', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 'R', 3], [3, 'R', 1], [6, 'R', 2], [8, 'R', 3], [11, '5', 1], [14, 'R', 2]],
      comp: [[0, 0.7, 4], [4, 0.6, 2], [6, 0.45, 4], [10, 0.45, 2], [12, 0.6, 2], [14, 0.45, 2]], // D D U U D U
    },
    reggae: {
      name: 'Reggae (one drop)', steps: 16, bpm: 76, prog: 'reggae', scale: 'minpent',
      drums: { kick: '........X.......', rim: '........x.......', hat: 'x.x.x.x.x.x.x.x.' },
      bass: [[2, 'R', 2], [4, 'R', 2], [7, '5', 1], [10, 'b7', 2], [12, '5', 3]],
      comp: [[4, 0.55, 1], [12, 0.55, 1]], // the "skank" on 2 and 4
      top: 3,
    },
    bossa: {
      name: 'Bossa nova', steps: 16, bpm: 128, prog: 'twoFiveOne', scale: 'majpent', color: 'jazz',
      drums: { kick: 'x..x....x..x....', rim: 'x..x..x...x..x..', hat: 'x.x.x.x.x.x.x.x.' },
      bass: [[0, 'R', 3], [3, '5', 1], [6, '5', 2], [8, '5', 3], [11, 'R', 1], [14, 'R', 2]],
      comp: [[0, 0.45, 3], [3, 0.4, 3], [6, 0.4, 2], [10, 0.4, 3], [13, 0.4, 3]],
      soft: true,
    },
    jazz: {
      name: 'Jazz swing', steps: 12, bpm: 140, prog: 'twoFiveOne', scale: 'majpent', color: 'jazz',
      drums: { ride: 'X..x.xX..x.x', pedal: '...x.....x..', kick: 'g..g..g..g..' },
      bass: [[0, 'R', 3], [3, '3', 3], [6, '5', 3], [9, 'A', 3]], // walking quarter notes
      comp: [[0, 0.45, 2], [5, 0.4, 2]], // the "Charleston" rhythm
      soft: true,
    },
  };

  // ---------- State ----------

  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })();
  const state = Object.assign({ style: 'blues', key: 9, prog: null, bpm: null, drums: true, bass: true, chords: true, volume: 0.8, countIn: true }, saved);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* storage unavailable */ } };

  const style = () => STYLES[state.style] || STYLES.blues;
  const progression = () => PROGRESSIONS[state.prog] || PROGRESSIONS[style().prog];
  const tempo = () => state.bpm || style().bpm;

  let ctx = null;
  let out = null;
  let noise = null;
  let timer = null;
  let running = false;
  let step = 0;        // steps since the start (count-in steps are negative)
  let nextTime = 0;
  let chords = [];     // the progression resolved to actual chords
  const queue = [];    // scheduled display updates
  let ui = {};
  let onShowScale = null;

  // ---------- Chords ----------

  function colorize(type, deg) {
    const c = style().color;
    if (c === 'dom' && type === 'maj') return '7';
    if (c === 'funk') return type === 'maj' ? '7' : type === 'min' ? 'm7' : type;
    if (c === 'jazz') {
      if (type === 'maj') return deg === 7 || deg === 9 || deg === 2 ? '7' : 'maj7';
      if (type === 'min') return 'm7';
    }
    return type;
  }

  function resolveChords() {
    const prog = progression();
    chords = prog.bars.map(([deg, type]) => {
      const t = Theory.chordType(colorize(type, deg));
      const root = (state.key + deg) % 12;
      // A comfortable shape around the 3rd–8th frets, so the comping sits in one register.
      const vs = Theory.findVoicings(root, t, 12).filter(v => v.frets.filter(f => f != null).length >= 4);
      const v = vs.reduce((a, x) => (!a || Math.abs(x.position - 5) < Math.abs(a.position - 5) ? x : a), null);
      let notes = [];
      if (v) v.frets.forEach((f, s) => { if (f != null) notes.push({ midi: Theory.midiAt(s, f), key: 's' + s }); });
      if (style().top) notes = notes.slice(-style().top);
      return { root, type: t, name: Theory.chordName(root, t), notes };
    });
  }

  const BASS_LOW = 28; // E1
  const bassRoot = pc => BASS_LOW + ((pc - (BASS_LOW % 12)) + 12) % 12;

  function bassNote(tone, chord, next) {
    const r = bassRoot(chord.root);
    const iv = chord.type.iv;
    const third = iv.find(i => i === 3 || i === 4) ?? 4;
    const fifth = iv.find(i => i === 6 || i === 7 || i === 8) ?? 7;
    const seventh = iv.find(i => i === 10 || i === 11 || i === 9) ?? 10;
    switch (tone) {
      case '3': return r + third;
      case '5': return r + fifth;
      case '6': return r + 9;
      case 'b7': return r + 10;
      case '7': return r + seventh;
      case '8': return r + 12;
      case 'A': { // chromatic approach from below to the next chord's root
        const target = bassRoot(next.root);
        const t = Math.abs(target - r) > 6 ? target + (target < r ? 12 : -12) : target;
        return t - 1 < BASS_LOW ? t + 1 : t - 1;
      }
      default: return r;
    }
  }

  // ---------- Instruments ----------

  function ensureAudio() {
    ctx = Sound.init();
    if (!ctx) return false;
    if (!out) {
      out = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 3;
      out.connect(comp).connect(ctx.destination);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    out.gain.value = state.volume;
    return true;
  }

  const envGain = (t, peak, decay) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return g;
  };

  function noiseSrc(t, dur) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    return src;
  }

  function kick(t, v) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    const g = envGain(t, 1.1 * v, 0.38);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  function snare(t, v) {
    const n = noiseSrc(t, 0.22);
    const bp = ctx.createBiquadFilter();
    bp.type = 'highpass';
    bp.frequency.value = 1400;
    n.connect(bp).connect(envGain(t, 0.75 * v, 0.18)).connect(out);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    o.connect(envGain(t, 0.5 * v, 0.1)).connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  // Cymbals: six detuned square waves (the classic analogue-drum-machine recipe) through high filters.
  const METAL = [2, 3, 4.16, 5.43, 6.79, 8.21];
  function metal(t, v, decay, base, band) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = band;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = envGain(t, 0.35 * v, decay);
    bp.connect(hp).connect(g).connect(out);
    for (const r of METAL) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = base * r;
      o.connect(bp);
      o.start(t);
      o.stop(t + decay + 0.02);
    }
  }
  const hat = (t, v, open) => metal(t, v, open ? 0.32 : 0.05, 40, 10000);
  const ride = (t, v) => metal(t, v * 0.8, 0.7, 52, 8000);

  function rim(t, v) {
    const o = ctx.createOscillator();
    o.frequency.value = 1750;
    o.connect(envGain(t, 0.5 * v, 0.03)).connect(out);
    o.start(t);
    o.stop(t + 0.05);
    const n = noiseSrc(t, 0.03);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000;
    n.connect(bp).connect(envGain(t, 0.4 * v, 0.025)).connect(out);
  }

  function bass(t, midi, v, dur) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7 * v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.4 * v, t + 0.15);
    g.gain.setValueAtTime(0.4 * v, t + Math.max(0.16, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    lp.connect(g).connect(out);
    for (const [type, mult, level] of [['sawtooth', 1, 0.6], ['triangle', 0.5, 0.9]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      const lg = ctx.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.08);
    }
  }

  const VEL = { X: 1, x: 0.75, g: 0.3, o: 0.8 };

  // ---------- Scheduler ----------

  function scheduleStep(n, t) {
    const st = style();
    const stepDur = 60 / tempo() / (st.steps / 4);
    if (n < 0) { // count-in: a stick click on each beat
      if ((n + st.steps) % (st.steps / 4) === 0) rim(t, n === -st.steps ? 1 : 0.7);
      queue.push({ time: t, countIn: true, beat: Math.floor((n + st.steps) / (st.steps / 4)) });
      return;
    }
    const s = n % st.steps;
    const bar = Math.floor(n / st.steps);
    const chord = chords[bar % chords.length];
    const next = chords[(bar + 1) % chords.length];
    const soft = st.soft ? 0.7 : 1;

    if (state.drums) {
      for (const [inst, pattern] of Object.entries(st.drums)) {
        const c = pattern[s];
        if (!c || c === '.') continue;
        const v = VEL[c] * soft;
        if (inst === 'kick') kick(t, v);
        else if (inst === 'snare') snare(t, v);
        else if (inst === 'hat') hat(t, v, c === 'o');
        else if (inst === 'ride') ride(t, v);
        else if (inst === 'pedal') hat(t, v * 0.6, false);
        else if (inst === 'rim') rim(t, v);
      }
    }
    if (state.bass) {
      for (const [at, tone, len] of st.bass) if (at === s) bass(t, bassNote(tone, chord, next), soft, len * stepDur);
    }
    if (state.chords && chord.notes.length) {
      for (const [at, gain, len] of st.comp) {
        if (at === s) Sound.strum(chord.notes, 0.012, t - ctx.currentTime - 0.01, gain * soft, len * stepDur * 0.95);
      }
    }
    if (s % (st.steps / 4) === 0) queue.push({ time: t, bar, beat: s / (st.steps / 4) });
  }

  function schedule() {
    const stepDur = 60 / tempo() / (style().steps / 4);
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += stepDur;
      step++;
    }
    draw();
  }

  function start() {
    if (running || !ensureAudio()) return;
    if (typeof Metronome !== 'undefined' && Metronome.isRunning()) Metronome.stop();
    resolveChords();
    running = true;
    step = state.countIn ? -style().steps : 0;
    nextTime = ctx.currentTime + 0.1;
    schedule();
    timer = setInterval(schedule, 25);
    render();
  }

  function stop() {
    running = false;
    clearInterval(timer);
    queue.length = 0;
    render();
  }

  const toggle = () => (running ? stop() : start());

  /** Restart from bar 1 if playing (after changing style, key or progression). */
  function restart() {
    if (!running) { render(); return; }
    stop();
    Sound.stopAll();
    start();
  }

  // ---------- Display ----------

  function draw() {
    while (queue.length && queue[0].time <= ctx.currentTime) {
      const q = queue.shift();
      if (!ui.beats) continue;
      ui.beats.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i === q.beat));
      if (q.countIn) {
        ui.now.textContent = String(q.beat + 1);
        ui.next.textContent = 'count-in';
        ui.bar.textContent = '';
        continue;
      }
      const c = chords[q.bar % chords.length];
      const n = chords[(q.bar + 1) % chords.length];
      ui.now.textContent = c.name;
      ui.next.textContent = `next: ${n.name}`;
      ui.bar.textContent = `bar ${(q.bar % chords.length) + 1} / ${chords.length}`;
      const btn = document.getElementById('metro-btn');
      if (btn && q.beat === 0) { btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse'); }
    }
  }

  function scaleTip() {
    // Minor progressions → minor pentatonic (blues styles keep the blues scale); major → the style's scale.
    const scaleId = progression().minor && style().scale !== 'blues' ? 'minpent' : style().scale;
    const type = Theory.scaleType(scaleId);
    return { scaleId, root: state.key, name: Theory.scaleName(state.key, type) };
  }

  function render() {
    if (!ui.play) return;
    ui.play.textContent = running ? '■ Stop' : '▶ Play';
    ui.play.setAttribute('aria-pressed', String(running));
    ui.bpm.textContent = tempo();
    ui.slider.value = tempo();
    if (!running) {
      resolveChords();
      ui.now.textContent = chords.map(c => c.name).filter((n, i, a) => a.indexOf(n) === i).join(' · ');
      ui.next.textContent = progression().name;
      ui.bar.textContent = `${chords.length} bars`;
      ui.beats.querySelectorAll('i').forEach(d => d.classList.remove('on'));
    }
    const tip = scaleTip();
    ui.tipName.textContent = tip.name;
  }

  function mount(el) {
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
    const select = (label, options, value, onChange) => {
      const s = h('select', { 'aria-label': label, onchange: e => onChange(e.target.value) });
      options.forEach(([v, text]) => { const o = h('option', { value: v }, text); if (String(v) === String(value)) o.selected = true; s.append(o); });
      return h('label', { class: 'ctl' }, h('span', {}, label), s);
    };
    const check = (label, prop) => {
      const i = h('input', { type: 'checkbox', onchange: e => { state[prop] = e.target.checked; save(); } });
      i.checked = state[prop];
      return h('label', { class: 'toggle' }, i, label);
    };
    const NOTE = ['C', 'C♯/D♭', 'D', 'E♭', 'E', 'F', 'F♯/G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

    ui.play = h('button', { type: 'button', class: 'btn primary metro-play', onclick: toggle });
    ui.bpm = h('output', { class: 'metro-bpm-value' });
    ui.slider = h('input', {
      type: 'range', min: 40, max: 220, 'aria-label': 'Jam tempo',
      oninput: e => { state.bpm = +e.target.value; ui.bpm.textContent = state.bpm; save(); },
    });
    ui.now = h('div', { class: 'jam-now' });
    ui.next = h('div', { class: 'jam-next' });
    ui.bar = h('div', { class: 'jam-bar' });
    ui.beats = h('div', { class: 'metro-beats', 'aria-hidden': 'true' }, ...[0, 1, 2, 3].map(i => h('i', i === 0 ? { class: 'first' } : {})));
    ui.tipName = h('b');
    const progSel = select('Chords', Object.entries(PROGRESSIONS).map(([id, p]) => [id, p.name]), progression() === PROGRESSIONS[state.prog] ? state.prog : style().prog, v => {
      state.prog = v;
      save();
      restart();
    });
    const volume = h('input', {
      type: 'range', min: 0, max: 1, step: 0.05, 'aria-label': 'Band volume',
      oninput: e => { state.volume = +e.target.value; if (out) out.gain.value = state.volume; save(); },
    });
    volume.value = state.volume;

    el.append(
      h('div', { class: 'jam-controls' },
        ui.play,
        h('div', { class: 'metro-tempo' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Slower', onclick: () => { state.bpm = Math.max(40, tempo() - 2); save(); render(); } }, '−'),
          h('div', { class: 'metro-bpm' }, ui.bpm, h('span', {}, 'BPM')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Faster', onclick: () => { state.bpm = Math.min(220, tempo() + 2); save(); render(); } }, '+')),
        ui.slider,
        select('Style', Object.entries(STYLES).map(([id, s]) => [id, s.name]), state.style, v => {
          state.style = v;
          state.prog = null; // each style brings its own progression and tempo
          state.bpm = null;
          progSel.querySelector('select').value = STYLES[v].prog;
          save();
          restart();
        }),
        select('Key', NOTE.map((n, i) => [i, n]), state.key, v => { state.key = +v; save(); restart(); }),
        progSel,
      ),
      h('div', { class: 'jam-controls' },
        check('Drums', 'drums'), check('Bass', 'bass'), check('Chords', 'chords'), check('Count-in', 'countIn'),
        h('label', { class: 'ctl' }, h('span', {}, 'Band vol'), volume),
      ),
      h('div', { class: 'jam-display' },
        h('div', { class: 'jam-chord' }, ui.now, h('div', { class: 'jam-meta' }, ui.next, ui.bar)),
        ui.beats,
        h('div', { class: 'jam-tip' }, 'Solo with ', ui.tipName, ' ',
          h('button', { type: 'button', class: 'btn', onclick: () => { const t = scaleTip(); if (onShowScale) onShowScale(t.root, t.scaleId); } }, 'Show on neck')),
      ),
    );
    render();
  }

  return {
    mount,
    start,
    stop,
    toggle,
    isRunning: () => running,
    /** Called with (rootPc, scaleId) when the user asks to see the suggested scale. */
    set onShowScale(fn) { onShowScale = fn; },
    STYLES,
    PROGRESSIONS,
  };
})();
