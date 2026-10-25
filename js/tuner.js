/* Chromatic tuner dialog: needle gauge, nearest note and cents, plus the strings of the current tuning. */
const Tuner = (() => {
  'use strict';

  const KEY = 'fw.tuner';
  let dialog = null;
  let refs = {};
  let unsubscribe = null;
  let pref = 'sharp';
  let history = [];
  let cents = 0;
  let lastHeard = 0;
  let a4 = (() => { try { return JSON.parse(localStorage.getItem(KEY))?.a4 || 440; } catch (_) { return 440; } })();
  Pitch.setA4(a4);

  const svg = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    return n;
  };
  const div = (cls, text) => {
    const n = document.createElement('div');
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function buildGauge() {
    const g = svg('svg', { viewBox: '0 0 240 140', class: 'tuner-gauge', 'aria-hidden': 'true' });
    const cx = 120;
    const cy = 125;
    const r = 100;
    const pt = (deg, rad) => [cx + rad * Math.sin((deg * Math.PI) / 180), cy - rad * Math.cos((deg * Math.PI) / 180)];
    // In-tune zone (±5 cents ≈ ±6°)
    const [zx1, zy1] = pt(-6, r);
    const [zx2, zy2] = pt(6, r);
    g.append(svg('path', { d: `M ${cx} ${cy} L ${zx1} ${zy1} A ${r} ${r} 0 0 1 ${zx2} ${zy2} Z`, class: 'tuner-zone' }));
    for (let c = -50; c <= 50; c += 5) {
      const deg = c * 1.2;
      const long = c % 25 === 0;
      const [x1, y1] = pt(deg, r);
      const [x2, y2] = pt(deg, r - (long ? 14 : 7));
      g.append(svg('line', { x1, y1, x2, y2, class: 'tuner-tick' + (long ? ' long' : '') }));
      if (long) {
        const [tx, ty] = pt(deg, r + 12);
        const t = svg('text', { x: tx, y: ty, class: 'tuner-tick-label' });
        t.textContent = c > 0 ? '+' + c : c;
        g.append(t);
      }
    }
    refs.needle = svg('line', { x1: cx, y1: cy, x2: cx, y2: cy - r + 6, class: 'tuner-needle' });
    g.append(refs.needle, svg('circle', { cx, cy, r: 6, class: 'tuner-hub' }));
    return g;
  }

  function build() {
    dialog = document.getElementById('tuner');
    const body = dialog.querySelector('.tuner-body');
    refs.status = div('tuner-status', 'Starting the microphone…');
    refs.note = div('tuner-note', '–');
    refs.octave = document.createElement('sub');
    refs.cents = div('tuner-cents', '');
    refs.freq = div('tuner-freq', '');
    refs.strings = div('tuner-strings');
    refs.a4 = document.createElement('output');
    const step = d => {
      a4 = Math.max(430, Math.min(450, a4 + d));
      Pitch.setA4(a4);
      try { localStorage.setItem(KEY, JSON.stringify({ a4 })); } catch (_) { /* storage unavailable */ }
      renderStrings();
      refs.a4.textContent = `A4 = ${a4} Hz`;
    };
    const btn = (label, fn, aria) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon-btn';
      b.textContent = label;
      b.setAttribute('aria-label', aria);
      b.addEventListener('click', fn);
      return b;
    };
    const readout = div('tuner-readout');
    readout.append(refs.note, refs.cents, refs.freq);
    refs.note.append(refs.octave);
    const calib = div('tuner-calib');
    calib.append(btn('−', () => step(-1), 'Lower reference pitch'), refs.a4, btn('+', () => step(1), 'Raise reference pitch'));
    body.append(buildGauge(), readout, refs.status, refs.strings, calib);
    refs.a4.textContent = `A4 = ${a4} Hz`;
    dialog.addEventListener('close', onClose);
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  }

  const freqOf = midi => a4 * Math.pow(2, (midi - 69) / 12);

  function renderStrings(active = -1, offset = 0) {
    refs.strings.replaceChildren(...Theory.TUNING.map((m, s) => s).reverse().map(s => {
      const m = Theory.TUNING[s];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tuner-string' + (s === active ? (Math.abs(offset) <= 5 ? ' is-in' : ' is-near') : '');
      b.title = `Play the ${Theory.STRING_LONG[s]} string (${freqOf(m).toFixed(1)} Hz)`;
      b.innerHTML = `<small>${6 - s}</small>${Theory.midiName(m, pref)}`;
      b.addEventListener('click', () => Sound.play(m, { key: 'tuner' }));
      return b;
    }));
  }

  function onFrame(frame) {
    const now = performance.now();
    if (Sound.isBusy(0.15)) return; // ignore our own reference tones
    if (frame.freq && frame.clarity > 0.88) {
      history.push(frame.midi);
      if (history.length > 5) history.shift();
      const sorted = [...history].sort((a, b) => a - b);
      const midi = sorted[Math.floor(sorted.length / 2)];
      const nearest = Math.round(midi);
      const raw = (midi - nearest) * 100;
      cents = Math.abs(raw - cents) > 30 ? raw : cents + (raw - cents) * 0.35;
      lastHeard = now;
      show(nearest, cents, a4 * Math.pow(2, (midi - 69) / 12), midi);
    } else if (now - lastHeard > 1200) {
      history = [];
      dialog.classList.remove('is-active', 'is-in-tune');
      refs.status.textContent = 'Play a single string and let it ring.';
    }
  }

  function show(nearest, c, hz, midi) {
    const deg = Math.max(-60, Math.min(60, c * 1.2));
    refs.needle.style.transform = `rotate(${deg}deg)`;
    refs.note.firstChild.nodeValue = Theory.shortName(nearest, pref);
    refs.octave.textContent = Theory.octave(nearest);
    const rounded = Math.round(c);
    refs.cents.textContent = `${rounded > 0 ? '+' : ''}${rounded}¢`;
    refs.freq.textContent = `${hz.toFixed(1)} Hz`;
    const inTune = Math.abs(c) <= 5;
    dialog.classList.add('is-active');
    dialog.classList.toggle('is-in-tune', inTune);

    // Closest open string in the current tuning.
    let best = -1;
    Theory.TUNING.forEach((m, s) => { if (best < 0 || Math.abs(midi - m) < Math.abs(midi - Theory.TUNING[best])) best = s; });
    const off = (midi - Theory.TUNING[best]) * 100;
    if (Math.abs(off) <= 250) {
      const name = `${Theory.STRING_LONG[best]} string`;
      refs.status.textContent = Math.abs(off) <= 5
        ? `${name[0].toUpperCase() + name.slice(1)} is in tune.`
        : `${name[0].toUpperCase() + name.slice(1)}: ${Math.abs(Math.round(off))}¢ ${off < 0 ? 'flat — tune up ↑' : 'sharp — tune down ↓'}`;
      renderStrings(best, off);
    } else {
      refs.status.textContent = inTune ? 'In tune.' : c < 0 ? 'Flat — tune up ↑' : 'Sharp — tune down ↓';
      renderStrings();
    }
  }

  async function open({ accidentals = 'sharp' } = {}) {
    if (!dialog) build();
    pref = accidentals;
    history = [];
    cents = 0;
    refs.note.firstChild.nodeValue = '–';
    refs.octave.textContent = '';
    refs.cents.textContent = '';
    refs.freq.textContent = '';
    refs.needle.style.transform = 'rotate(0deg)';
    dialog.classList.remove('is-active', 'is-in-tune', 'is-error');
    renderStrings();
    dialog.showModal();
    refs.status.textContent = 'Starting the microphone…';
    unsubscribe = Pitch.subscribe(onFrame);
    try {
      await Pitch.acquire('tuner');
      if (dialog.open) refs.status.textContent = 'Play a single string and let it ring.';
    } catch (err) {
      dialog.classList.add('is-error');
      refs.status.textContent = err.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in the browser’s address bar, then reopen the tuner.'
        : err.message || 'Could not start the microphone.';
    }
  }

  function onClose() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    Pitch.release('tuner');
  }

  return { open };
})();
