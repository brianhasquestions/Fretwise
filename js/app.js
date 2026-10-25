/* Fretwise — app shell, settings and the four modes (Explore, Note Quiz, Chord Quiz, Note Finder). */
(() => {
  'use strict';

  const T = Theory;
  const $ = sel => document.querySelector(sel);

  // ---------- Small helpers ----------

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const rand = n => Math.floor(Math.random() * n);
  const pick = arr => arr[rand(arr.length)];
  const range = n => [...Array(n).keys()];
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function weightedPick(items, weightOf) {
    const ws = items.map(weightOf);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) {
      r -= ws[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch (_) { /* storage unavailable */ }
    },
  };

  // ---------- Settings ----------

  const DEFAULTS = {
    theme: 'system', // 'system' | 'light' | 'dark'
    tuning: 'standard',
    tone: 'acoustic',
    frets: 15,
    minFret: 0,
    maxFret: 12,
    strings: [true, true, true, true, true, true],
    accidentals: 'sharp',
    flipped: false,
    chordTypes: ['maj', 'min', '7'],
    rootInBass: true,
    scaleTypes: ['minpent', 'majpent'],
    pentShapes: [1, 2, 3, 4, 5],
    pentExtended: true,
    arpTypes: ['maj', 'min', '7', 'maj7', 'm7'],
    triadTypes: ['maj', 'min'],
    triadSets: ['345', '234', '123', '012'],
    triadInversions: [0, 1, 2],
    intervals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    intervalBelow: false,
    earIntervalStyle: 'up',
    earChords: ['maj', 'min', '7', 'maj7', 'm7', 'dim', 'aug'],
    phraseLength: 4,
    micSensitivity: 6,
    sound: true,
    volume: 0.8,
  };
  const settings = Object.assign({}, DEFAULTS, store.get('fw.settings', {}));
  const saveSettings = () => store.set('fw.settings', settings);
  Sound.setVolume(settings.volume);
  Sound.setEnabled(settings.sound);
  T.setTuning(settings.tuning);
  Sound.setTone(settings.tone);
  Pitch.setSensitivity(settings.micSensitivity);

  const quizMax = () => Math.min(settings.maxFret, settings.frets);

  function quizPositions() {
    const strings = settings.strings.some(Boolean) ? settings.strings : DEFAULTS.strings;
    const out = [];
    for (let s = 0; s < 6; s++) {
      if (!strings[s]) continue;
      for (let f = settings.minFret; f <= quizMax(); f++) out.push({ s, f });
    }
    return out;
  }

  // ---------- Adaptive weighting & stats ----------

  const weak = store.get('fw.weak', {});
  const weightOf = key => 1 + 2 * (weak[key] || 0);
  function markWeak(key, missed) {
    const v = weak[key] || 0;
    const next = missed ? Math.min(4, v + 1.5) : Math.max(0, v - 0.5);
    if (next) weak[key] = next; else delete weak[key];
    store.set('fw.weak', weak);
  }

  const session = {};
  const best = store.get('fw.best', {});
  const statFor = key => (session[key] ||= { asked: 0, correct: 0, streak: 0, time: 0, timed: 0 });

  function record(ok, ms) {
    const key = current.statKey();
    const d = statFor(key);
    d.asked++;
    if (ok) {
      d.correct++;
      d.streak++;
      if (ms) { d.time += ms; d.timed++; }
      if (d.streak > (best[key] || 0)) { best[key] = d.streak; store.set('fw.best', best); }
    } else {
      d.streak = 0;
    }
    renderStats();
  }

  function renderStats() {
    const el = $('#stats');
    if (current === Explore) { el.replaceChildren(); renderMic(); return; }
    const key = current.statKey();
    const d = statFor(key);
    const item = (label, value, extra) => h('div', { class: 'stat' }, h('span', null, label), h('b', null, value), extra ? h('small', null, extra) : null);
    el.replaceChildren(
      item('Score', `${d.correct}/${d.asked}`),
      item('Accuracy', d.asked ? Math.round((100 * d.correct) / d.asked) + '%' : '—'),
      item('Streak', d.streak, `best ${best[key] || 0}`),
      item('Avg time', d.timed ? (d.time / d.timed / 1000).toFixed(1) + 's' : '—'),
    );
    renderMic();
  }

  // ---------- Timers (cancelled on every question / mode change) ----------

  let timers = [];
  const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- UI plumbing ----------

  const ui = {
    submodes: $('#submodes'),
    controls: $('#controls'),
    prompt: $('#prompt'),
    sub: $('#prompt-sub'),
    feedback: $('#feedback'),
    actions: $('#actions'),
    pad: $('#pad'),
    hint: $('#hint'),
  };

  function resetUI() {
    ui.controls.replaceChildren();
    ui.prompt.innerHTML = '';
    ui.sub.textContent = '';
    feedback('');
    ui.actions.replaceChildren();
    ui.pad.replaceChildren();
    ui.pad.hidden = true;
    ui.pad.classList.remove('wide');
    ui.hint.innerHTML = '';
  }

  function feedback(html, kind = '') {
    ui.feedback.className = 'feedback' + (kind ? ' is-' + kind : '');
    ui.feedback.innerHTML = html;
  }

  function button(label, onClick, { cls = '', kbd, title } = {}) {
    return h('button', { type: 'button', class: ('btn ' + cls).trim(), onclick: onClick, title }, label, kbd ? h('kbd', null, kbd) : null);
  }

  const setActions = (...btns) => ui.actions.replaceChildren(...btns.filter(Boolean));

  function segmented(options, value, onChange) {
    return options.map(([v, label]) =>
      h('button', {
        type: 'button',
        class: 'seg' + (v === value ? ' is-active' : ''),
        'aria-pressed': String(v === value),
        onclick: () => { if (v !== value) onChange(v); },
      }, label));
  }

  const setSubmodes = (options, value, onChange) => ui.submodes.replaceChildren(...segmented(options, value, onChange));

  function toggle(label, checked, onChange) {
    return h('label', { class: 'toggle' },
      h('input', { type: 'checkbox', checked, onchange: e => onChange(e.target.checked) }), label);
  }

  function select(label, options, value, onChange) {
    return h('label', { class: 'ctl' }, h('span', null, label),
      h('select', { onchange: e => onChange(e.target.value) },
        options.map(([v, text]) => h('option', { value: v, selected: String(v) === String(value) }, text))));
  }

  function tonesHtml(root, type) {
    const tones = [...T.toneMap(root, type).values()];
    return `<span class="tones">${tones.map(t => `<span class="tone">${esc(t.name)}<small>${esc(t.label)}</small></span>`).join('')}</span>`;
  }

  const LEGEND = [['iv-r', 'Root'], ['iv-3', '3rd'], ['iv-5', '5th'], ['iv-7', '7th'], ['iv-x', '2nd / 4th']];
  const legend = (items = LEGEND) => h('div', { class: 'legend' }, items.map(([cls, label]) => h('span', null, h('i', { class: cls }), label)));

  // Names
  const dotName = pc => T.shortName(pc, settings.accidentals);
  const padName = pc => T.noteName(pc, settings.accidentals);
  const midiName = m => T.midiName(m, settings.accidentals);
  function askName(pc) {
    const sp = T.spellings(pc);
    if (sp.length === 1 || settings.accidentals === 'sharp') return sp[0];
    if (settings.accidentals === 'flat') return sp[1];
    return pick(sp);
  }
  const stringLabel = s => `${T.STRING_ORDINAL[s]} string (${T.STRING_LONG[s]})`;
  const fretLabel = f => (f === 0 ? 'open' : 'fret ' + f);

  function ivClass(semi) {
    return { 0: 'iv-r', 3: 'iv-3', 4: 'iv-3', 6: 'iv-5', 7: 'iv-5', 8: 'iv-5', 9: 'iv-7', 10: 'iv-7', 11: 'iv-7' }[semi] || 'iv-x';
  }

  // ---------- Fretboard & sound ----------

  const fb = new Fretboard($('#fretboard'), {
    frets: settings.frets,
    flipped: settings.flipped,
    onPress(s, f, cell) {
      if (cell.classList.contains('out')) return;
      Sound.init();
      current.onCell && current.onCell(s, f);
    },
  });

  function playPos(s, f, opts = {}) {
    Sound.play(T.midiAt(s, f), Object.assign({ key: 's' + s }, opts));
    if (!opts.when) fb.pluck(s);
    else later(() => fb.pluck(s), opts.when * 1000);
  }

  function strumShape(frets) {
    const notes = [];
    frets.forEach((f, s) => { if (f != null) notes.push({ midi: T.midiAt(s, f), key: 's' + s, s }); });
    Sound.strum(notes);
    notes.forEach((n, i) => later(() => fb.pluck(n.s), i * 45));
  }

  const applyRange = () => fb.setRange(settings.minFret, quizMax(), settings.strings.some(Boolean) ? settings.strings : DEFAULTS.strings);

  /** Draw a chord shape. labels: 'notes' | 'intervals' | 'none'. */
  function drawShape(frets, root, type, { labels = 'intervals', neutral = false } = {}) {
    const tones = T.toneMap(root, type);
    frets.forEach((f, s) => {
      if (f == null) { fb.mark(s, 0, { label: '×', cls: 'dot-mute' }); return; }
      const t = tones.get(T.pcAt(s, f));
      const label = labels === 'none' || !t ? '' : labels === 'notes' ? t.name : t.label;
      fb.mark(s, f, { label, cls: neutral || !t ? 'dot-note' : ivClass(t.semi) });
    });
  }

  /** A standard chord diagram (low string on the left) as SVG: dots coloured by chord tone,
      open/muted markers, a barre when the shape needs one, and the starting fret. */
  function chordDiagram(frets, root, type) {
    const tones = T.toneMap(root, type);
    const fretted = frets.filter(f => f != null && f > 0);
    const min = fretted.length ? Math.min(...fretted) : 0;
    const max = fretted.length ? Math.max(...fretted) : 0;
    const start = max <= 5 ? 1 : min;
    const X = s => 12 + s * 10;
    const Y = f => 20 + (f - start + 0.5) * 13;
    let svg = '<svg class="chord-diagram" viewBox="0 0 74 104" aria-hidden="true">';
    for (let i = 0; i <= 5; i++) {
      svg += `<line class="cd-fret${i === 0 && start === 1 ? ' cd-nut' : ''}" x1="12" x2="62" y1="${20 + i * 13}" y2="${20 + i * 13}"/>`;
    }
    for (let s = 0; s < 6; s++) svg += `<line class="cd-string" x1="${X(s)}" x2="${X(s)}" y1="20" y2="85"/>`;
    if (start > 1) svg += `<text class="cd-pos" x="7" y="${Y(start) + 3}">${start}</text>`;
    if (fretted.length > 4 && T.fingerCount(frets) <= 4) {
      const atMin = frets.map((f, s) => (f === min ? s : -1)).filter(s => s >= 0);
      const top = Math.max(...frets.map((f, s) => (f != null ? s : -1)));
      if (atMin.length >= 2) svg += `<rect class="cd-barre" x="${X(atMin[0]) - 4.5}" y="${Y(min) - 4.5}" width="${X(top) - X(atMin[0]) + 9}" height="9" rx="4.5"/>`;
    }
    frets.forEach((f, s) => {
      if (f == null) svg += `<text class="cd-mark" x="${X(s)}" y="14">×</text>`;
      else if (f === 0) svg += `<circle class="cd-open" cx="${X(s)}" cy="11" r="3.2"/>`;
      else {
        const t = tones.get(T.pcAt(s, f));
        svg += `<circle class="cd-dot ${t ? ivClass(t.semi) : ''}" cx="${X(s)}" cy="${Y(f)}" r="4.4"/>`;
      }
    });
    T.STRING_NAMES.forEach((n, s) => { svg += `<text class="cd-name" x="${X(s)}" y="98">${esc(n)}</text>`; });
    return svg + '</svg>';
  }

  // ---------- Pentatonic & arpeggio shapes (shared by Explore and the Scale Quiz) ----------

  // family: 'pent' (pentatonic / blues scales) or 'arp' (arpeggios of chord types)
  const familyType = (family, id) =>
    family === 'pent' ? T.scaleType(id) || T.scaleType('minpent') : T.chordType(id) || T.chordType('min');
  const familyTypes = family => (family === 'pent' ? T.SCALE_TYPES : T.ARP_TYPES);

  /** Pentatonics colour just the root (and blue note) so the box shape reads clearly; arpeggios colour every chord tone. */
  function toneClass(family, type, semi) {
    if (family === 'arp') return ivClass(semi);
    if (semi === 0) return 'iv-r';
    return semi === type.blue ? 'iv-x' : 'dot-note';
  }

  function shapeLegend(family, type) {
    if (family === 'arp') return legend(LEGEND.filter(([cls]) => type.iv.some(i => ivClass(i) === cls)));
    return legend([['iv-r', 'Root'], ['dot-note', 'Scale tone'], ...(type.blue ? [['iv-x', 'Blue note (♭5)']] : [])]);
  }

  const shapeSuffix = family => (family === 'pent' ? '' : ' arpeggio');

  const shapeTitle = (family, root, type) =>
    `<b class="hl">${esc(T.chordRootName(root, type))}</b> <span class="soft">${esc(type.name + shapeSuffix(family))}</span>`;

  const shapePlainName = (family, root, type) => T.scaleName(root, type) + shapeSuffix(family);

  /** "shape 3" for the boxes, "extended shape 1" for the diagonal pentatonic patterns. */
  const shapeName = (sh, capital = false) => {
    const name = `${sh.extended ? 'extended shape' : 'shape'} ${sh.index + 1}`;
    return capital ? name[0].toUpperCase() + name.slice(1) : name;
  };

  function relativeNote(root, type) {
    if (!type.relative) return '';
    const [id, shift] = type.relative;
    return `Same notes as ${T.scaleName(T.mod(root + shift, 12), T.scaleType(id))}.`;
  }

  function markTone(n, family, type, tones, { labels = 'intervals', extra = '' } = {}) {
    const t = tones.get(n.pc);
    const label = labels === 'none' ? '' : labels === 'notes' ? t.name : t.label;
    fb.mark(n.s, n.f, { label, cls: toneClass(family, type, n.semi) + (extra ? ' ' + extra : '') });
  }

  /** How an interval sounds: the root, then the other note, then both together. */
  function playIntervalSound(a, b, [sa, sb] = []) {
    Sound.stopAll();
    Sound.play(a, { key: 'ivA' });
    Sound.play(b, { key: 'ivB', when: 0.6 });
    Sound.play(a, { key: 'ivC', when: 1.35 });
    Sound.play(b, { key: 'ivD', when: 1.35 });
    if (sa != null) { fb.pluck(sa); later(() => fb.pluck(sa), 1350); }
    if (sb != null) { later(() => fb.pluck(sb), 600); later(() => fb.pluck(sb), 1350); }
  }

  /** Six-string fret array (null = not played) from a list of { s, f } notes. */
  function fretsOf(notes) {
    const frets = new Array(6).fill(null);
    notes.forEach(n => { frets[n.s] = n.f; });
    return frets;
  }

  /** Interval-map colours pair each interval with its inversion (3rds & 6ths, 4ths & 5ths, 2nds & 7ths). */
  function mapClass(d) {
    const r = T.mod(Math.abs(d), 12);
    if (r === 0) return 'iv-r';
    if (r === 6) return 'iv-7';
    if ([3, 4, 8, 9].includes(r)) return 'iv-3';
    if ([5, 7].includes(r)) return 'iv-5';
    return 'iv-x';
  }

  /** Play a shape up and back down, plucking each string as it sounds. */
  function playRun(notes, gap = 0.17) {
    Sound.stopAll();
    const seq = [...notes, ...notes.slice(0, -1).reverse()];
    Sound.sequence(seq.map(n => ({ midi: n.midi, key: 's' + n.s })), gap);
    seq.forEach((n, i) => later(() => fb.pluck(n.s), i * gap * 1000));
  }

  // ---------- Positions for a pitch (microphone answers, reveals) ----------

  /** Every position on the neck that sounds `midi`; with inRange, only those in the quiz frets/strings. */
  function positionsFor(midi, { inRange = false } = {}) {
    const strings = settings.strings.some(Boolean) ? settings.strings : DEFAULTS.strings;
    const out = [];
    for (let s = 0; s < 6; s++) {
      const f = midi - T.TUNING[s];
      if (f < 0 || f > settings.frets) continue;
      if (inRange && (f < settings.minFret || f > quizMax() || !strings[s])) continue;
      out.push({ s, f });
    }
    return out;
  }

  /** The position whose fret is closest to `ref` (the hand rarely jumps far). */
  const nearest = (list, ref = 5) =>
    list.reduce((a, p) => (!a || Math.abs(p.f - ref) < Math.abs(a.f - ref) ? p : a), null);

  /** "a perfect 4th above", "an octave below", "a major 3rd + 1 octave above"… */
  function describeInterval(diff) {
    if (diff === 0) return 'the same note';
    const dir = diff > 0 ? 'above' : 'below';
    const a = Math.abs(diff);
    const oct = Math.floor(a / 12);
    const rem = a % 12;
    if (!rem) return `${oct === 1 ? 'an octave' : oct + ' octaves'} ${dir}`;
    const name = T.interval(rem).name;
    return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}${oct ? ` + ${oct} octave${oct > 1 ? 's' : ''}` : ''} ${dir}`;
  }

  /** Short dot label for a distance from the root: P5, M3, −m3, P8… */
  function intervalShort(diff) {
    const a = Math.abs(diff);
    const label = a % 12 === 0 ? (a ? 'P8' : 'R') : T.interval(a % 12).short;
    return (diff < 0 ? '−' : '') + label;
  }

  // ---------- Songs for Free play ----------

  /** Choose a position for every note of a melody so the hand moves as little as possible (Viterbi
      search over all the places each note can be played). Transposes by octaves to fit the neck. */
  function fingerMelody(midis) {
    const lo = T.TUNING[0];
    const hi = T.TUNING[5] + Math.min(settings.frets, 15);
    let shift = 0;
    const min = Math.min(...midis);
    const max = Math.max(...midis);
    while (min + shift < lo) shift += 12;
    while (max + shift > hi && min + shift - 12 >= lo) shift -= 12;
    const notes = midis.map(m => m + shift);
    const opts = notes.map(m => {
      const all = positionsFor(m);
      const low = all.filter(p => p.f <= 12);
      return low.length ? low : all;
    });
    if (opts.some(o => !o.length)) return null;
    const stay = p => (p.f > 7 ? (p.f - 7) * 0.3 : 0) - (p.f === 0 ? 0.2 : 0); // prefer low positions & open strings
    const move = (a, b) => (a.f === 0 || b.f === 0 ? 0 : Math.abs(a.f - b.f)) + Math.abs(a.s - b.s) * 0.5;
    let prev = opts[0].map(p => ({ c: stay(p), back: -1 }));
    const steps = [prev];
    for (let i = 1; i < notes.length; i++) {
      prev = opts[i].map(p => {
        let best = Infinity;
        let arg = 0;
        opts[i - 1].forEach((q, j) => {
          const c = steps[i - 1][j].c + move(q, p);
          if (c < best) { best = c; arg = j; }
        });
        return { c: best + stay(p), back: arg };
      });
      steps.push(prev);
    }
    let j = prev.reduce((a, x, k) => (x.c < prev[a].c ? k : a), 0);
    const path = new Array(notes.length);
    for (let i = notes.length - 1; i >= 0; i--) {
      path[i] = { ...opts[i][j], midi: notes[i] };
      j = steps[i][j].back;
    }
    return path;
  }

  const SongPlayer = {
    song: null,
    idx: 0,
    playing: false,
    path: null,     // melody fingering
    shapes: null,   // chord shapes
    refs: {},
    bpm: 100,

    load(id) {
      this.stop();
      this.song = Songs.byId(id);
      this.idx = 0;
      this.bpm = this.song ? this.song.bpm : 100;
      this.prepare();
    },

    /** (Re)compute fingerings — also after the tuning or neck length changes. */
    prepare() {
      const s = this.song;
      this.path = null;
      this.shapes = null;
      if (!s) return;
      if (s.kind === 'melody') this.path = fingerMelody(s.notes.map(n => n.midi));
      else {
        this.shapes = s.chords.map(c => {
          const type = T.chordType(c.type);
          const v = T.findVoicings(c.root, type, settings.frets)[0];
          let bass = T.TUNING[0];
          while (T.mod(bass, 12) !== c.root) bass++; // lowest root on the neck, for the shuffle
          return { ...c, typeObj: type, frets: v ? v.frets : null, position: v ? v.position : 0, bass };
        });
      }
    },

    length() { return this.song ? (this.song.kind === 'melody' ? this.song.notes.length : this.song.chords.length) : 0; },
    done() { return this.idx >= this.length(); },

    chordNotes(sh) {
      const notes = [];
      (sh.frets || []).forEach((f, s) => { if (f != null) notes.push({ s, f, midi: T.midiAt(s, f), key: 's' + s }); });
      return notes;
    },

    // --- Panel (song header, controls and the strip of notes/chords)
    panel() {
      const s = this.song;
      const strip = h('div', { class: 'song-strip', role: 'list' });
      const items = s.kind === 'melody'
        ? s.notes.map((n, i) => h('span', { class: 'song-chip', role: 'listitem', style: `--w:${Math.max(1, n.beats)}` }, this.path ? dotName(this.path[i].midi) : '?'))
        : s.chords.map(c => h('span', { class: 'song-chip is-chord', role: 'listitem', style: `--w:${Math.max(1, c.beats / 2)}` }, c.name));
      strip.append(...items);
      const listen = button(this.playing ? '■ Stop' : '▶ Listen', () => (this.playing ? this.stop() : this.listen()), { cls: 'primary' });
      const tempo = h('input', { type: 'range', min: 40, max: 220, value: this.bpm, 'aria-label': 'Listening tempo' });
      const bpmOut = h('output', null, `${this.bpm} BPM`);
      tempo.addEventListener('input', () => { this.bpm = +tempo.value; bpmOut.textContent = `${this.bpm} BPM`; });
      this.refs = { strip, items, listen };
      const panel = h('div', { class: 'song-panel' },
        h('div', { class: 'song-head' },
          h('div', null, h('b', null, s.title), h('small', null, ` · ${s.credit}${s.pd === false ? '' : ' · public domain'}${s.swing || s.style === 'shuffle' ? ' · swing feel' : ''}`)),
          h('div', { class: 'song-buttons' },
            listen,
            button('⟲ Restart', () => this.restart()),
            h('label', { class: 'ctl' }, h('span', null, 'Tempo'), tempo, bpmOut))),
        strip);
      this.updateStrip();
      return panel;
    },

    updateStrip(cursor = this.idx) {
      const { items, strip } = this.refs;
      if (!items) return;
      items.forEach((el, i) => {
        el.classList.toggle('is-done', i < cursor);
        el.classList.toggle('is-current', i === cursor);
      });
      const cur = items[Math.min(cursor, items.length - 1)];
      if (cur && strip) strip.scrollTo({ left: cur.offsetLeft - strip.clientWidth / 2 + cur.offsetWidth / 2, behavior: 'smooth' });
    },

    // --- Play-along targets on the neck
    drawTargets() {
      fb.clear();
      if (!this.song || this.done()) return;
      if (this.song.kind === 'melody') {
        if (!this.path) return;
        const next = this.path[this.idx + 1];
        if (next) fb.mark(next.s, next.f, { label: dotName(next.midi), cls: 'dot-ghost' });
        const cur = this.path[this.idx];
        fb.mark(cur.s, cur.f, { label: dotName(cur.midi), cls: 'dot-target' });
        fb.scrollToFret(cur.f);
      } else {
        const sh = this.shapes[this.idx];
        if (sh.frets) {
          drawShape(sh.frets, sh.root, sh.typeObj);
          fb.scrollToFret(sh.position + 1);
        }
      }
    },

    subText() {
      if (!this.song) return '';
      if (this.done()) return 'Song complete — press Restart to go again, or Listen to hear it.';
      return this.song.kind === 'melody'
        ? `Note ${this.idx + 1} of ${this.length()}: play the glowing note (the faint one comes next). Any place with the same pitch counts.`
        : `Chord ${this.idx + 1} of ${this.length()}: ${this.song.chords[this.idx].name} — tap the shape to strum it and move on.`;
    },

    advance() {
      this.idx++;
      this.updateStrip();
      this.drawTargets();
      ui.sub.textContent = this.subText();
      if (this.done()) {
        feedback(`🎉 That's all of <b>${esc(this.song.title)}</b>! Restart to play it again, or pick another song.`, 'good');
      }
    },

    /** A tap in Free play. Chord songs strum the whole shape; returns true if the song made the sound. */
    onTap(s, f) {
      if (!this.song || this.playing || this.done()) return false;
      if (this.song.kind === 'chords') {
        const sh = this.shapes[this.idx];
        if (!sh.frets || sh.frets[s] === f) {
          Sound.strum(this.chordNotes(sh));
          this.chordNotes(sh).forEach((n, i) => later(() => fb.pluck(n.s), i * 45));
          feedback(`<b>${esc(sh.name)}</b>`, 'info');
          this.advance();
          return true;
        }
      }
      return false;
    },

    /** Compare a played pitch (tap or microphone) with the next melody note. */
    check(midi, at) {
      if (!this.song || this.song.kind !== 'melody' || this.playing || this.done() || !this.path) return;
      const want = this.path[this.idx].midi;
      if (midi === want) {
        const p = at || this.path[this.idx];
        feedback('');
        this.advance();
        // Flash where it was played, unless that spot is now the next target.
        const same = q => q && q.s === p.s && q.f === p.f;
        if (!this.done() && !same(this.path[this.idx]) && !same(this.path[this.idx + 1])) {
          fb.mark(p.s, p.f, { label: dotName(midi), cls: 'dot-good dot-tap' });
          setTimeout(() => { const c = fb.cell(p.s, p.f); if (c && c.lastChild.classList.contains('dot-tap')) fb.unmark(p.s, p.f); }, 1200);
        }
      } else {
        feedback(`That was ${esc(midiName(midi))}. Next note: <b>${esc(midiName(want))}</b> — ${esc(Ear.hint(want, midi))}`, 'warn');
      }
    },

    restart() {
      this.stop();
      this.idx = 0;
      feedback('');
      this.updateStrip();
      this.drawTargets();
      ui.sub.textContent = this.subText();
    },

    // --- Listen: play the whole song, lighting each note or chord as it sounds
    listen() {
      if (!this.song) return;
      this.stop();
      if (this.done()) this.idx = 0;
      Sound.init();
      this.playing = true;
      this.refs.listen.firstChild.nodeValue = '■ Stop';
      const beat = 60 / this.bpm;
      let t = 0.1;
      const from = this.idx;
      if (this.song.kind === 'melody') {
        if (!this.path) return;
        // Swing: an off-beat eighth starts two-thirds of the way through the beat instead of halfway.
        const swing = p => (this.song.swing && Math.abs((p % 1) - 0.5) < 1e-6 ? Math.floor(p) + 2 / 3 : p);
        const startBeat = this.song.notes.slice(0, from).reduce((a, n) => a + n.beats, 0);
        let pos = startBeat;
        for (let i = from; i < this.path.length; i++) {
          const p = this.path[i];
          t = 0.1 + (swing(pos) - startBeat) * beat;
          pos += this.song.notes[i].beats;
          Sound.play(p.midi, { key: 'song', when: t });
          later(() => {
            fb.clear();
            fb.mark(p.s, p.f, { label: dotName(p.midi), cls: 'dot-accent pop' });
            fb.pluck(p.s);
            this.updateStrip(i);
          }, t * 1000);
        }
        t = 0.1 + (pos - startBeat) * beat;
      } else {
        for (let i = from; i < this.shapes.length; i++) {
          const sh = this.shapes[i];
          const notes = this.chordNotes(sh);
          if (!notes.length) { t += sh.beats * beat; continue; }
          const order = [...notes.keys(), ...[...notes.keys()].reverse().slice(1, -1)]; // up, then back down
          for (let b = 0; b < sh.beats; b++) {
            const at = t + b * beat;
            if (this.song.style === 'shuffle') {
              // Root + 5th on the beat, root + 6th (♭7 on beat 3) on the swung off-beat.
              const r = sh.bass;
              const up = b % 4 === 2 ? 10 : 9;
              Sound.play(r, { key: 'shA', when: at, gain: 0.8 });
              Sound.play(r + 7, { key: 'shB', when: at, gain: 0.7 });
              Sound.play(r, { key: 'shA', when: at + beat * 2 / 3, gain: 0.6 });
              Sound.play(r + up, { key: 'shB', when: at + beat * 2 / 3, gain: 0.55 });
            } else if (this.song.style === 'arp') {
              const n = notes[order[b % order.length]];
              Sound.play(n.midi, { key: 's' + n.s, when: at, gain: 0.85 });
            } else {
              Sound.strum(notes, 0.03, at, b === 0 ? 0.85 : 0.6);
            }
          }
          later(() => {
            fb.clear();
            if (sh.frets) drawShape(sh.frets, sh.root, sh.typeObj);
            fb.scrollToFret(sh.position + 1);
            this.updateStrip(i);
            feedback(`<b>${esc(sh.name)}</b>`, 'info');
          }, t * 1000);
          t += sh.beats * beat;
        }
      }
      later(() => {
        this.playing = false;
        if (this.refs.listen) this.refs.listen.firstChild.nodeValue = '▶ Listen';
        this.updateStrip();
        this.drawTargets();
      }, t * 1000 + 300);
    },

    stop() {
      if (!this.playing) return;
      this.playing = false;
      clearTimers();
      Sound.stopAll();
      if (this.refs.listen) this.refs.listen.firstChild.nodeValue = '▶ Listen';
      this.updateStrip();
      this.drawTargets();
    },
  };

  // =====================================================================
  // Explore
  // =====================================================================

  const Explore = {
    id: 'explore',
    state: Object.assign({
      view: 'free',
      shapes: 'common', // chord view: 'common' (best shape per position) or 'all'
      chordMode: 'single', // chord view: 'single' chord or 'prog' (progressions)
      prog: { id: 'pop', key: null, style: 'barre', area: 'auto', idx: 0, bpm: 84, preview: true },
      pc: 0, root: 0, type: 'maj', voicing: -1, labels: 'notes', naturals: false, octaves: false,
      free: { names: true, ring: false, song: null }, // free-play view
      scale: { root: 9, type: 'minpent', shape: 0, layout: 'box' }, // pentatonic view ('box' or 'extended')
      arp: { root: 9, type: 'min', shape: 0 },       // arpeggio view
      triad: { root: 0, type: 'maj', set: '345', inv: -1, shape: -1 }, // triad view
      interval: { semi: 4, dir: 1, s: 1, f: 3 },                       // interval view (root C3 on the A string)
    }, store.get('fw.explore', {})),
    statKey() { return 'explore'; },
    save() { store.set('fw.explore', this.state); },

    enter() {
      const id = this.state.free.song || null;
      if (id !== (SongPlayer.song ? SongPlayer.song.id : null)) SongPlayer.load(id);
      this.render();
      ui.hint.innerHTML = `Tap any fret to hear it. Tuning: ${esc(T.currentTuning().name)} — change it, the neck length and note spelling in Settings.`;
    },

    render() {
      SongPlayer.stop();
      this.stopProg();
      if (this.state.view === 'free') SongPlayer.prepare(); // tuning or neck length may have changed
      this.renderControls();
      this.draw();
      this.renderGallery();
      this.renderLearn();
    },

    onKey(e) {
      if (e.key === ' ' && this.state.view === 'free' && SongPlayer.song) {
        if (SongPlayer.playing) SongPlayer.stop();
        else SongPlayer.listen();
        return true;
      }
      return false;
    },

    /** The expandable explanation under the fretboard for the current view. */
    renderLearn() {
      const el = $('#learn');
      const tuning = T.currentTuning();
      const sec = Learn.sections({ standard: tuning.id === 'standard', tuningName: tuning.name, strings: [...T.STRING_NAMES] })[this.state.view];
      el.hidden = !sec;
      if (!sec) return;
      el.querySelector('.learn-title').textContent = sec.title;
      el.querySelector('.learn-body').innerHTML = sec.html;
      el.open = store.get('fw.learn.open', false);
    },

    voicings() {
      const type = T.chordType(this.state.type) || T.chordType('maj');
      const find = this.state.shapes === 'all' ? T.allVoicings : T.findVoicings;
      return find(this.state.root, type, settings.frets);
    },

    // --- Progressions (Chords view, "Progressions" mode): movable shapes with smooth voice leading

    chordModeSwitch(update) {
      return h('div', { class: 'segmented' },
        segmented([['single', 'Single chord'], ['prog', 'Progressions']], this.state.chordMode || 'single', v => update({ chordMode: v })));
    },

    progData() {
      const cfg = this.state.prog;
      const p = Progressions.byId(cfg.id);
      const key = cfg.key ?? p.key;
      const chords = Progressions.voice(p, key, cfg.style, cfg.area, settings.frets);
      if (cfg.idx >= chords.length) cfg.idx = 0;
      const keyName = `${T.noteName(key, 'both')} ${p.minor ? 'minor' : 'major'}`;
      return { cfg, p, key, keyName, chords };
    },

    renderProgControls(update) {
      const { cfg, p, key, chords } = this.progData();
      const set = patch => { this.stopProg(); Object.assign(cfg, patch); update({}); };
      const step = d => { this.stopProg(); this.showProgChord((cfg.idx + d + chords.length) % chords.length, true); };
      const tempo = h('input', { type: 'range', min: 40, max: 180, value: cfg.bpm, 'aria-label': 'Progression tempo' });
      const bpmOut = h('output', null, `${cfg.bpm} BPM`);
      tempo.addEventListener('input', () => { cfg.bpm = +tempo.value; bpmOut.textContent = `${cfg.bpm} BPM`; this.save(); });
      this.progBtn = button(this.progPlaying ? '■ Stop' : '▶ Play', () => (this.progPlaying ? this.stopProg() : this.playProg()), { cls: 'primary' });
      ui.controls.append(
        select('Progression', Progressions.LIST.map(x => [x.id, x.name]), cfg.id, v => set({ id: v, key: null, idx: 0 })),
        select('Key', range(12).map(pc => [pc, `${T.noteName(pc, 'both')} ${p.minor ? 'minor' : 'major'}`]), key, v => set({ key: +v })),
        select('Shapes', Object.entries(Progressions.STYLES), cfg.style, v => set({ style: v })),
        select('Neck', Object.entries(Progressions.AREAS), cfg.area, v => set({ area: v })),
        select('Labels', [['notes', 'Note names'], ['intervals', 'Intervals']], this.state.labels, v => update({ labels: v })),
        h('div', { class: 'stepper' },
          button('◀', () => step(-1), { title: 'Previous chord' }),
          h('span', { class: 'label prog-step' }, `Chord ${cfg.idx + 1} of ${chords.length}`),
          button('▶', () => step(1), { title: 'Next chord' })),
        this.progBtn,
        h('label', { class: 'ctl' }, h('span', null, 'Tempo'), tempo, bpmOut),
        toggle('Show next chord', cfg.preview, v => set({ preview: v })),
      );
    },

    drawProgView() {
      const { cfg, p, keyName, chords } = this.progData();
      const cur = chords[cfg.idx];
      const next = chords[(cfg.idx + 1) % chords.length];
      ui.prompt.innerHTML = `<b class="hl">${esc(p.name)}</b> <span class="soft">in ${esc(keyName)}</span>`;
      ui.sub.textContent = `${p.feel} ${chords.map(c => c.name).join(' – ')}.`;
      // The next chord's shape, faintly, so you can see where your fingers are going.
      if (cfg.preview && chords.length > 1 && next.voicing) {
        next.voicing.frets.forEach((f, s) => { if (f != null && (!cur.voicing || cur.voicing.frets[s] !== f)) fb.mark(s, f, { cls: 'dot-ghost' }); });
      }
      if (cur.voicing) {
        drawShape(cur.voicing.frets, cur.root, cur.type, { labels: this.state.labels });
        fb.scrollToFret(cur.voicing.position);
        feedback(`<b>${esc(cur.numeral)}</b> · ${esc(cur.name)} · ${T.shapeString(cur.voicing.frets)}`, 'info');
      }
      if (!ui.controls.querySelector('.legend')) ui.controls.append(legend());
    },

    renderProgGallery(el) {
      const { cfg, p, keyName, chords } = this.progData();
      const fretted = chords.flatMap(c => (c.voicing ? c.voicing.frets.filter(f => f != null && f > 0) : []));
      const where = fretted.length ? ` · frets ${Math.min(...fretted)}–${Math.max(...fretted)}` : '';
      const cards = chords.map((c, i) => {
        const card = h('button', {
          type: 'button',
          class: 'chord-card' + (i === cfg.idx ? ' is-active' : ''),
          title: `Show ${c.name} and strum it`,
          onclick: () => { this.stopProg(); this.showProgChord(i, true); },
        });
        card.innerHTML = c.voicing ? chordDiagram(c.voicing.frets, c.root, c.type) : '';
        card.prepend(h('span', { class: 'chord-card-numeral' }, c.numeral));
        card.append(h('span', { class: 'chord-card-label' }, c.name), h('small', null, c.voicing ? T.shapeString(c.voicing.frets) : 'no shape'));
        return card;
      });
      el.hidden = false;
      el.replaceChildren(
        h('div', { class: 'gallery-head' },
          h('h2', null, p.name, h('small', null, ` in ${keyName} · ${Progressions.STYLES[cfg.style]}${where}`))),
        h('div', { class: 'gallery-grid' }, cards),
      );
    },

    /** Move to a chord of the progression without rebuilding the controls (so playback keeps going). */
    showProgChord(i, strum = false) {
      const { chords } = this.progData();
      this.state.prog.idx = i;
      this.save();
      this.draw();
      this.renderGallery();
      const label = ui.controls.querySelector('.prog-step');
      if (label) label.textContent = `Chord ${i + 1} of ${chords.length}`;
      if (strum && chords[i].voicing) strumShape(chords[i].voicing.frets);
    },

    /** Loop the progression: a strum on every beat, the shapes following on the neck. */
    playProg() {
      this.stopProg();
      Sound.init();
      this.progPlaying = true;
      if (this.progBtn) this.progBtn.firstChild.nodeValue = '■ Stop';
      const run = from => {
        if (!this.progPlaying || this.state.view !== 'chord' || this.state.chordMode !== 'prog') return;
        const { cfg, p, chords } = this.progData();
        const beat = 60 / cfg.bpm;
        const beats = p.beats || 4;
        let t = 0.06;
        for (let i = from; i < chords.length; i++) {
          const v = chords[i].voicing;
          const notes = [];
          if (v) v.frets.forEach((f, s) => { if (f != null) notes.push({ midi: T.midiAt(s, f), key: 's' + s }); });
          for (let b = 0; b < beats; b++) Sound.strum(notes, 0.018, t + b * beat, b === 0 ? 0.8 : 0.55, beat * 0.92);
          later(() => this.showProgChord(i), t * 1000);
          t += beats * beat;
        }
        later(() => run(0), t * 1000 - 60); // loop
      };
      run(this.state.prog.idx);
    },

    stopProg() {
      if (!this.progPlaying) return;
      this.progPlaying = false;
      clearTimers();
      Sound.stopAll();
      if (this.progBtn) this.progBtn.firstChild.nodeValue = '▶ Play';
    },

    /** Every shape of the selected chord as chord diagrams, under the fretboard. */
    renderGallery() {
      const el = $('#gallery');
      const st = this.state;
      if (st.view !== 'chord') { el.hidden = true; return; }
      if (st.chordMode === 'prog') { this.renderProgGallery(el); return; }
      const type = T.chordType(st.type) || T.chordType('maj');
      const list = this.voicings();
      el.hidden = false;
      const cards = list.map((v, i) => {
        const card = h('button', {
          type: 'button',
          class: 'chord-card' + (i === st.voicing ? ' is-active' : ''),
          title: `Show ${T.shapeString(v.frets)} on the neck and strum it`,
          onclick: () => {
            st.voicing = i;
            this.save();
            this.render();
            strumShape(v.frets);
            document.querySelector('.board-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          },
        });
        card.innerHTML = chordDiagram(v.frets, st.root, type);
        card.append(h('span', { class: 'chord-card-label' }, T.shapeString(v.frets)),
          h('small', null, v.position === 0 ? 'open position' : `fret ${v.position}`));
        return card;
      });
      el.replaceChildren(
        h('div', { class: 'gallery-head' },
          h('h2', null, `Shapes of ${T.chordName(st.root, type)}`,
            h('small', null, ` ${type.name} · ${list.length} shape${list.length === 1 ? '' : 's'} · ${T.currentTuning().name}`)),
          h('div', { class: 'segmented' }, segmented([['common', 'Best per position'], ['all', 'Every shape']], st.shapes, v => this.setShapes(v)))),
        list.length
          ? h('div', { class: 'gallery-grid' }, cards)
          : h('p', { class: 'prompt-sub' }, 'No playable shapes fit on this neck — try more frets in Settings.'),
      );
    },

    /** Switch between the best shape per position and every shape, keeping the shown one if possible. */
    setShapes(v) {
      const st = this.state;
      const cur = st.voicing >= 0 ? this.voicings()[st.voicing] : null;
      st.shapes = v;
      if (cur) st.voicing = Math.max(0, this.voicings().findIndex(x => x.frets.join() === cur.frets.join()));
      this.save();
      this.render();
    },


    renderControls() {
      const st = this.state;
      const update = patch => { Object.assign(st, patch); this.save(); this.render(); };
      setSubmodes([['free', 'Free play'], ['all', 'All notes'], ['note', 'One note'], ['chord', 'Chords'], ['triad', 'Triads'], ['interval', 'Intervals'], ['scale', 'Pentatonics'], ['arp', 'Arpeggios']], st.view, v => update({ view: v }));
      const c = ui.controls;
      c.replaceChildren();

      if (st.view === 'free') {
        c.append(
          select('Sound', Object.entries(Sound.TONES).map(([id, t]) => [id, t.name]), settings.tone, v => {
            settings.tone = v;
            saveSettings();
            Sound.setTone(v);
            const g = T.findVoicings(7, T.chordType('maj'), settings.frets)[0]; // a quick G chord to hear the new sound
            if (g) strumShape(g.frets);
          }),
          toggle('Show note names', st.free.names, v => update({ free: { ...st.free, names: v } })),
          toggle('Let notes ring', st.free.ring, v => update({ free: { ...st.free, ring: v } })),
          button('Strum open strings', () => strumShape([0, 0, 0, 0, 0, 0])),
          select('Song', [['', 'No song — just play'],
            ...Songs.LIST.map(s => [s.id, `${s.tag || (s.kind === 'melody' ? 'Melody' : 'Chords')} · ${s.title}`])],
          st.free.song || '', v => {
            SongPlayer.load(v || null);
            feedback('');
            update({ free: { ...st.free, song: v || null } });
          }),
        );
        if (SongPlayer.song) c.append(SongPlayer.panel());
      } else if (st.view === 'all') {
        c.append(
          toggle('Naturals only', st.naturals, v => update({ naturals: v })),
          toggle('Octave numbers', st.octaves, v => update({ octaves: v })),
        );
      } else if (st.view === 'note') {
        c.append(
          h('div', { class: 'chips' }, range(12).map(pc =>
            h('button', { type: 'button', class: 'chip' + (pc === st.pc ? ' is-active' : ''), onclick: () => update({ pc }) }, padName(pc)))),
          toggle('Octave numbers', st.octaves, v => update({ octaves: v })),
        );
      } else if (st.view === 'scale' || st.view === 'arp') {
        this.renderShapeControls(update);
      } else if (st.view === 'triad') {
        this.renderTriadControls(update);
      } else if (st.view === 'interval') {
        this.renderIntervalControls(update);
      } else if (st.chordMode === 'prog') {
        c.append(this.chordModeSwitch(update));
        this.renderProgControls(update);
      } else {
        c.append(this.chordModeSwitch(update));
        const voicings = this.voicings();
        if (st.voicing >= voicings.length) st.voicing = voicings.length - 1;
        const step = d => {
          const n = voicings.length;
          let v = st.voicing + d;
          if (v < -1) v = n - 1;
          if (v >= n) v = -1;
          update({ voicing: v });
          if (v >= 0) strumShape(voicings[v].frets);
        };
        c.append(
          select('Root', range(12).map(pc => [pc, T.noteName(pc, 'both')]), st.root, v => update({ root: +v, voicing: st.voicing >= 0 ? 0 : -1 })),
          select('Type', T.CHORD_TYPES.map(t => [t.id, t.name + (t.symbol ? ` (${t.symbol})` : '')]), st.type, v => update({ type: v, voicing: st.voicing >= 0 ? 0 : -1 })),
          select('Labels', [['notes', 'Note names'], ['intervals', 'Intervals']], st.labels, v => update({ labels: v })),
          h('div', { class: 'stepper' },
            button('◀', () => step(-1), { title: 'Previous shape' }),
            h('span', { class: 'label' }, st.voicing < 0 ? 'All chord tones' : `Shape ${st.voicing + 1} of ${voicings.length}`),
            button('▶', () => step(1), { title: 'Next shape' })),
          button('Strum', () => {
            const v = voicings[Math.max(0, st.voicing)];
            if (v) strumShape(v.frets);
          }, { cls: 'primary' }),
        );
      }
    },

    // --- Intervals view: a root you can move, plus one interval or the full interval map around it

    intervalView() {
      const cfg = this.state.interval;
      cfg.f = Math.max(0, Math.min(cfg.f, settings.frets)); // the neck may have been shortened
      const rootMidi = T.midiAt(cfg.s, cfg.f);
      const iv = cfg.semi ? T.interval(cfg.semi) : null;
      const target = iv ? rootMidi + cfg.dir * iv.semi : null;
      return { cfg, rootMidi, iv, target };
    },

    renderIntervalControls(update) {
      const { cfg, rootMidi } = this.intervalView();
      const set = patch => { Object.assign(cfg, patch); update({}); };
      const moveRootTo = pc => { // same string, nearest fret with that note
        let best = cfg.f;
        let dist = Infinity;
        for (let f = 0; f <= settings.frets; f++) {
          if (T.pcAt(cfg.s, f) === pc && Math.abs(f - cfg.f) < dist) { best = f; dist = Math.abs(f - cfg.f); }
        }
        set({ f: best });
      };
      ui.controls.append(...[
        select('Interval', [[0, 'All (interval map)'], ...T.INTERVALS.map(i => [i.semi, `${i.short} · ${i.name}`])], cfg.semi, v => set({ semi: +v })),
        cfg.semi ? select('Direction', [[1, 'Above the root'], [-1, 'Below the root']], cfg.dir, v => set({ dir: +v })) : null,
        select('Root', range(12).map(pc => [pc, T.noteName(pc, 'both')]), T.mod(rootMidi, 12), v => moveRootTo(+v)),
        cfg.semi ? button('Play', () => this.playInterval(), { cls: 'primary', title: 'Root, then the interval, then both together' }) : null,
      ].filter(Boolean));
    },

    /** Play the selected interval from the root (to its nearest position, for the string animation). */
    playInterval() {
      const { cfg, rootMidi, target } = this.intervalView();
      const p = nearest(positionsFor(target), cfg.f);
      playIntervalSound(rootMidi, target, [cfg.s, p ? p.s : null]);
    },

    drawIntervalView() {
      const { cfg, rootMidi, iv, target } = this.intervalView();
      const F = settings.frets;
      const rootName = midiName(rootMidi);
      const tapHint = ' Tap a dot to hear it against the root; tap anywhere else to move the root.';
      if (iv) {
        const exact = positionsFor(target);
        // The same note in other octaves, labelled by its real distance from the root (e.g. a M3 up is a m6 down).
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= F; f++) {
            const m = T.midiAt(s, f);
            if (T.mod(m, 12) === T.mod(target, 12) && m !== target) fb.mark(s, f, { label: intervalShort(m - rootMidi), cls: 'dot-ghost' });
          }
        }
        exact.forEach(p => fb.mark(p.s, p.f, { label: iv.short, cls: 'dot-accent' }));
        ui.prompt.innerHTML = `<b class="hl">${esc(iv.name)}</b> <span class="soft">${cfg.dir > 0 ? 'above' : 'below'} ${esc(rootName)}: ${esc(rootName)} → ${esc(midiName(target))}</span>`;
        ui.sub.textContent = (exact.length
          ? `${midiName(target)} can be played in ${exact.length} place${exact.length > 1 ? 's' : ''}. Faint dots are the same note in other octaves, labelled by their distance from the root.`
          : `${midiName(target)} is off this neck; the faint dots are the same note in other octaves.`) + tapHint;
        ui.controls.append(legend([['iv-r', 'Root'], ['dot-accent', iv.short + ' (exact pitch)'], ['dot-ghost', 'Same note, other octaves']]));
      } else {
        for (let s = 0; s < 6; s++) {
          for (let f = Math.max(0, cfg.f - 4); f <= Math.min(F, cfg.f + 4); f++) {
            if (s === cfg.s && f === cfg.f) continue;
            const d = T.midiAt(s, f) - rootMidi;
            if (Math.abs(d) > 12) continue;
            fb.mark(s, f, { label: d === 0 ? 'R' : intervalShort(d), cls: mapClass(d) });
          }
        }
        ui.prompt.innerHTML = `Interval map around <b class="hl">${esc(rootName)}</b>`;
        ui.sub.textContent = 'Every note within four frets of the root, named by its distance from it (− means below).' +
          (T.currentTuning().id === 'standard' ? ' The shapes repeat everywhere, except that they shift up a fret when they cross onto the B string.' : '') + tapHint;
        ui.controls.append(legend([['iv-r', 'Octave'], ['iv-3', '3rds & 6ths'], ['iv-5', '4ths & 5ths'], ['iv-x', '2nds & 7ths'], ['iv-7', 'Tritone']]));
      }
      fb.mark(cfg.s, cfg.f, { label: 'R', cls: 'iv-r' });
      fb.scrollToFret(cfg.f);
    },

    tapInterval(s, f) {
      const { cfg, rootMidi, iv, target } = this.intervalView();
      const m = T.midiAt(s, f);
      const rootName = midiName(rootMidi);
      if (s === cfg.s && f === cfg.f) {
        if (iv) this.playInterval();
        else playPos(s, f);
        feedback(iv ? `${esc(rootName)} → ${esc(midiName(target))}: ${esc(iv.name)} ${cfg.dir > 0 ? 'up' : 'down'}, then both together.` : `<b>${esc(rootName)}</b> — the root.`, 'info');
        return;
      }
      if (fb.cell(s, f).classList.contains('marked')) {
        playIntervalSound(rootMidi, m, [cfg.s, s]);
        const d = m - rootMidi;
        feedback(d === 0
          ? `<b>${esc(midiName(m))}</b> — the same pitch as the root, on another string.`
          : `<b>${esc(midiName(m))}</b> is ${esc(describeInterval(d))} ${esc(rootName)}.`, 'info');
        return;
      }
      Object.assign(cfg, { s, f });
      this.save();
      this.render();
      playPos(s, f);
      feedback(`Root moved to <b>${esc(midiName(m))}</b>.`, 'info');
    },

    // --- Free play: a blank neck to play on
    flashTimers: new Map(),
    playFree(s, f) {
      const { names, ring } = this.state.free;
      if (SongPlayer.onTap(s, f)) return; // chord songs strum the whole shape
      playPos(s, f, ring ? { key: undefined } : {}); // "let ring" lets notes on the same string overlap
      const midi = T.midiAt(s, f);
      const cell = fb.cell(s, f);
      if (names && !cell.classList.contains('marked')) {
        const key = s + ':' + f;
        clearTimeout(this.flashTimers.get(key));
        fb.mark(s, f, { label: dotName(T.pcAt(s, f)), cls: 'dot-tap' });
        this.flashTimers.set(key, setTimeout(() => {
          if (current === Explore && this.state.view === 'free' && cell.lastChild.classList.contains('dot-tap')) fb.unmark(s, f);
        }, 1200));
      }
      const melody = SongPlayer.song && SongPlayer.song.kind === 'melody' && !SongPlayer.playing && !SongPlayer.done();
      if (melody) SongPlayer.check(midi, { s, f });
      else feedback(`<b>${esc(midiName(midi))}</b> · ${esc(stringLabel(s))}, ${fretLabel(f)}`, 'info');
    },

    /** The triad shape on screen that contains (s, f), if any. */
    triadAt(s, f) {
      const { cfg, list } = this.triadList();
      const shown = cfg.shape < 0 ? list : [list[cfg.shape]].filter(Boolean);
      return shown.find(sh => sh.notes.some(n => n.s === s && n.f === f)) || null;
    },

    /** Triad shapes for the Explore view, filtered by string set and inversion, ordered up the neck. */
    triadList() {
      const cfg = this.state.triad;
      const type = T.chordType(cfg.type) || T.chordType('maj');
      const sets = cfg.set === 'all' ? T.STRING_SETS : [T.stringSet(cfg.set)];
      const invs = cfg.inv < 0 ? [0, 1, 2] : [cfg.inv];
      const list = [];
      for (const set of sets) for (const inv of invs) list.push(...T.triadShapes(cfg.root, type, inv, set, settings.frets));
      list.sort((a, b) => a.position - b.position || b.set.strings[0] - a.set.strings[0]);
      if (cfg.shape >= list.length) cfg.shape = list.length - 1;
      return { cfg, type, list };
    },

    renderTriadControls(update) {
      const st = this.state;
      const { cfg, list } = this.triadList();
      const set = patch => { Object.assign(cfg, patch); update({}); };
      const shapeFrets = sh => fretsOf(sh.notes);
      const step = d => {
        let v = cfg.shape + d;
        if (v < -1) v = list.length - 1;
        if (v >= list.length) v = -1;
        set({ shape: v });
        if (v >= 0) strumShape(shapeFrets(this.triadList().list[v]));
      };
      ui.controls.append(
        select('Root', range(12).map(pc => [pc, T.noteName(pc, 'both')]), cfg.root, v => set({ root: +v, shape: -1 })),
        select('Type', T.TRIAD_TYPES.map(t => [t.id, t.name]), cfg.type, v => set({ type: v, shape: -1 })),
        select('Strings', [['all', 'All sets'], ...T.STRING_SETS.map(x => [x.id, x.label])], cfg.set, v => set({ set: v, shape: -1 })),
        select('Inversion', [[-1, 'All'], ...T.INVERSIONS.map(i => [i.id, i.name])], cfg.inv, v => set({ inv: +v, shape: -1 })),
        select('Labels', [['notes', 'Note names'], ['intervals', 'Intervals']], st.labels, v => update({ labels: v })),
        h('div', { class: 'stepper' },
          button('◀', () => step(-1), { title: 'Previous shape' }),
          h('span', { class: 'label' }, cfg.shape < 0 ? `All ${list.length} shapes` : `Shape ${cfg.shape + 1} of ${list.length}`),
          button('▶', () => step(1), { title: 'Next shape' })),
        button('Strum', () => {
          const sh = list[Math.max(0, cfg.shape)];
          if (sh) strumShape(shapeFrets(sh));
        }, { cls: 'primary' }),
        button('Arpeggiate', () => {
          const sh = list[Math.max(0, cfg.shape)];
          if (sh) playRun(sh.notes, 0.22);
        }),
      );
    },

    drawTriadView() {
      const { cfg, type, list } = this.triadList();
      const tones = T.toneMap(cfg.root, type);
      const label = n => (this.state.labels === 'notes' ? tones.get(n.pc).name : tones.get(n.pc).label);
      ui.prompt.innerHTML = `<b class="hl">${esc(T.chordName(cfg.root, type))}</b> <span class="soft">${esc(type.name)} triad</span> ${tonesHtml(cfg.root, type)}`;
      const shown = cfg.shape < 0 ? list : [list[cfg.shape]].filter(Boolean);
      shown.forEach(sh => sh.notes.forEach(n => fb.mark(n.s, n.f, { label: label(n), cls: ivClass(n.semi) })));
      if (cfg.shape < 0) {
        ui.sub.textContent = list.length
          ? 'Each inversion moves the bottom note up to the next chord tone: R-3-5 → 3-5-R → 5-R-3. Tap any shape to hear it as a chord.'
          : 'No close-voiced shapes fit on this neck.';
      } else if (shown[0]) {
        const sh = shown[0];
        ui.sub.textContent = `${T.INVERSIONS[sh.inversion].name} · strings ${sh.set.label} · frets ${T.fretSpan(sh.notes).join('–')}`;
        fb.scrollToFret(sh.position);
      }
      ui.controls.append(legend(LEGEND.slice(0, 3)));
    },

    /** The pentatonic / arpeggio view state: { family, cfg, type, shapes, shape }. */
    shapeView() {
      const family = this.state.view === 'scale' ? 'pent' : 'arp';
      const cfg = this.state[this.state.view];
      const type = familyType(family, cfg.type);
      const extended = family === 'pent' && cfg.layout === 'extended' && type.iv.length === 5;
      const shapes = extended ? T.extendedShapes(cfg.root, type, settings.frets) : T.positionShapes(cfg.root, type, settings.frets);
      if (cfg.shape >= shapes.length) cfg.shape = shapes.length - 1;
      return { family, cfg, type, shapes, extended, shape: cfg.shape >= 0 ? shapes[cfg.shape] : null };
    },

    renderShapeControls(update) {
      const st = this.state;
      const { family, cfg, type, shapes, extended } = this.shapeView();
      const set = patch => { Object.assign(cfg, patch); update({}); };
      const runShape = () => {
        const v = this.shapeView();
        const sh = v.shape || v.shapes[0];
        if (sh) playRun(sh.placements[0]);
      };
      const step = d => {
        let v = cfg.shape + d;
        if (v < -1) v = shapes.length - 1;
        if (v >= shapes.length) v = -1;
        set({ shape: v });
        if (v >= 0) runShape();
      };
      ui.controls.append(
        select('Root', range(12).map(pc => [pc, T.noteName(pc, 'both')]), cfg.root, v => set({ root: +v })),
        select(family === 'pent' ? 'Scale' : 'Chord', familyTypes(family).map(t => [t.id, t.name]), cfg.type, v => set({ type: v })),
        family === 'pent' && type.iv.length === 5
          ? h('div', { class: 'segmented' }, segmented([['box', 'Boxes'], ['extended', 'Extended']], cfg.layout || 'box',
            v => set({ layout: v, shape: v === 'extended' ? 0 : cfg.shape })))
          : null,
        select('Labels', [['notes', 'Note names'], ['intervals', 'Intervals']], st.labels, v => update({ labels: v })),
        h('div', { class: 'stepper' },
          button('◀', () => step(-1), { title: 'Previous shape' }),
          h('span', { class: 'label' }, cfg.shape < 0 ? 'Whole neck' : `${extended ? 'Extended' : 'Shape'} ${cfg.shape + 1} of ${shapes.length}`),
          button('▶', () => step(1), { title: 'Next shape' })),
        button('Play', runShape, { cls: 'primary', title: 'Play the shape up and back down' }),
      );
    },

    drawShapeView() {
      const { family, cfg, type, shapes, shape } = this.shapeView();
      const labels = this.state.labels;
      const tones = T.toneMap(cfg.root, type);
      const F = settings.frets;
      const all = [];
      for (let s = 0; s < 6; s++) {
        for (let f = 0; f <= F; f++) {
          const pc = T.pcAt(s, f);
          if (tones.has(pc)) all.push({ s, f, pc, midi: T.midiAt(s, f), semi: T.mod(pc - cfg.root, 12) });
        }
      }
      ui.prompt.innerHTML = `${shapeTitle(family, cfg.root, type)} ${tonesHtml(cfg.root, type)}`;
      const rel = family === 'pent' ? ' ' + relativeNote(cfg.root, type) : '';

      if (!shape) {
        all.forEach(n => markTone(n, family, type, tones, { labels }));
        ui.sub.textContent = (family === 'pent'
          ? `Every note of the scale. Step through the ${shapes.length} shapes to learn it one box at a time.`
          : `Every chord tone on the neck. Step through the ${shapes.length} shapes to play it in one position.`) + rel;
      } else {
        const notes = shape.placements[0];
        const inShape = new Set(notes.map(n => n.s + ':' + n.f));
        // Faint dots for the rest of the neck show how neighbouring shapes connect.
        all.forEach(n => { if (!inShape.has(n.s + ':' + n.f)) fb.mark(n.s, n.f, { label: labels === 'notes' ? tones.get(n.pc).name : tones.get(n.pc).label, cls: 'dot-ghost' }); });
        notes.forEach(n => markTone(n, family, type, tones, { labels }));
        const [lo, hi] = T.fretSpan(notes);
        const start = tones.get(notes[0].pc);
        ui.sub.textContent = `${shapeName(shape, true)} · frets ${lo}–${hi} · starts on the ${T.degreeName(start.label)} (${start.name}) on the ${T.STRING_LONG[0]} string.` +
          (shape.extended ? ` ${shape.counts.join('-')} notes per string — slide up a position on each 3-note string.` : '') +
          (shape.truncated ? ' The top runs past the end of this neck; add frets in Settings to see it all.' : '') + rel;
        fb.scrollToFret(lo);
      }
      ui.controls.append(shapeLegend(family, type));
    },

    draw() {
      const st = this.state;
      fb.clear();
      fb.setRange(null);
      fb.highlightString(null);
      fb.setInteractive(true);
      fb.setPointerPlay(st.view === 'free');
      const F = settings.frets;

      if (st.view === 'free') {
        ui.prompt.innerHTML = SongPlayer.song ? `Free play · <span class="hl">${esc(SongPlayer.song.title)}</span>` : 'Free play';
        if (SongPlayer.song) {
          SongPlayer.drawTargets();
          ui.sub.textContent = SongPlayer.subText();
          ui.hint.innerHTML = '<kbd>Space</kbd> listens / stops. With the mic on, you can play the melody on your guitar instead of tapping.';
        } else {
          ui.sub.textContent = 'Tap anywhere on the neck to play. With a mouse, drag across the strings to strum or along a string to slide; ' +
            'on a touchscreen, tap with several fingers for a chord. Pick a song to play along.';
        }
      } else if (st.view === 'all') {
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= F; f++) {
            const pc = T.pcAt(s, f);
            const natural = T.isNatural(pc);
            if (st.naturals && !natural) continue;
            fb.mark(s, f, { label: st.octaves ? midiName(T.midiAt(s, f)) : dotName(pc), cls: natural ? 'dot-note' : 'dot-acc' });
          }
        }
        ui.prompt.innerHTML = 'Every note on the neck';
        ui.sub.textContent = st.naturals
          ? 'Just the natural notes. Notice E–F and B–C sit one fret apart; everything else is two.'
          : 'Solid dots are natural notes; dark dots are sharps/flats. The pattern repeats at the 12th fret.';
      } else if (st.view === 'note') {
        let count = 0;
        for (let s = 0; s < 6; s++) {
          for (let f = 0; f <= F; f++) {
            if (T.pcAt(s, f) !== st.pc) continue;
            count++;
            fb.mark(s, f, { label: st.octaves ? midiName(T.midiAt(s, f)) : dotName(st.pc), cls: 'dot-accent' });
          }
        }
        ui.prompt.innerHTML = `Every <b class="hl">${esc(padName(st.pc))}</b> on the neck`;
        ui.sub.textContent = `${count} positions across ${F} frets.` +
          (T.currentTuning().id === 'standard' ? ' Look for octave shapes: two strings up and two frets over.' : '');
      } else if (st.view === 'scale' || st.view === 'arp') {
        this.drawShapeView();
      } else if (st.view === 'triad') {
        this.drawTriadView();
      } else if (st.view === 'interval') {
        this.drawIntervalView();
      } else if (st.chordMode === 'prog') {
        this.drawProgView();
      } else {
        const type = T.chordType(st.type) || T.chordType('maj');
        const tones = T.toneMap(st.root, type);
        const voicings = this.voicings();
        ui.prompt.innerHTML = `<b class="hl">${esc(T.chordName(st.root, type))}</b> <span class="soft">${esc(type.name)}</span> ${tonesHtml(st.root, type)}`;
        if (st.voicing < 0) {
          for (let s = 0; s < 6; s++) {
            for (let f = 0; f <= F; f++) {
              const t = tones.get(T.pcAt(s, f));
              if (t) fb.mark(s, f, { label: st.labels === 'notes' ? t.name : t.label, cls: ivClass(t.semi) });
            }
          }
          ui.sub.textContent = voicings.length
            ? 'Every chord tone on the neck. Step through the shapes, or pick one from the diagrams below the neck.'
            : 'Every chord tone on the neck.';
        } else {
          const v = voicings[st.voicing];
          drawShape(v.frets, st.root, type, { labels: st.labels });
          ui.sub.textContent = `Shape ${T.shapeString(v.frets)} · ${v.position === 0 ? 'open position' : 'position ' + v.position}`;
        }
        ui.controls.append(legend());
      }
    },

    onCell(s, f) {
      const st = this.state;
      if (st.view === 'free') { this.playFree(s, f); return; }
      if (st.view === 'interval') { this.tapInterval(s, f); return; }
      if (st.view === 'triad') {
        const sh = this.triadAt(s, f);
        if (sh) {
          const { cfg, type } = this.triadList();
          strumShape(fretsOf(sh.notes));
          const tones = T.toneMap(cfg.root, type);
          feedback(`<b>${esc(T.chordName(cfg.root, type))}</b> ${esc(T.INVERSIONS[sh.inversion].name)} · strings ${sh.set.label} · ` +
            esc(sh.notes.map(n => tones.get(n.pc).name).join(' – ')), 'info');
          return;
        }
      }
      if (st.view === 'chord' && st.chordMode === 'prog') {
        const { chords, cfg } = this.progData();
        const v = chords[cfg.idx].voicing;
        if (v && v.frets[s] === f) { strumShape(v.frets); return; }
      } else if (st.view === 'chord' && st.voicing >= 0) {
        const v = this.voicings()[st.voicing];
        if (v && v.frets[s] === f) {
          strumShape(v.frets);
          feedback(`<b>${esc(T.chordName(st.root, T.chordType(st.type)))}</b> · ${T.shapeString(v.frets)}`, 'info');
          return;
        }
      }
      playPos(s, f);
      const midi = T.midiAt(s, f);
      let extra = '';
      if (this.state.view === 'chord') {
        const type = T.chordType(this.state.type);
        const t = type && T.toneMap(this.state.root, type).get(T.pcAt(s, f));
        if (t) extra = ` — the <b>${esc(t.label)}</b> of ${esc(T.chordName(this.state.root, type))}`;
      } else if (this.state.view === 'triad') {
        const { cfg, type } = this.triadList();
        const t = T.toneMap(cfg.root, type).get(T.pcAt(s, f));
        if (t) extra = ` — the <b>${esc(t.label)}</b> of ${esc(T.chordName(cfg.root, type))}`;
      } else if (this.state.view === 'scale' || this.state.view === 'arp') {
        const { family, cfg, type } = this.shapeView();
        const t = T.toneMap(cfg.root, type).get(T.pcAt(s, f));
        if (t) extra = ` — the <b>${esc(t.label)}</b> of ${esc(shapePlainName(family, cfg.root, type))}`;
      }
      feedback(`<b>${esc(midiName(midi))}</b> · ${esc(stringLabel(s))}, ${fretLabel(f)}${extra}`, 'info');
    },
  };

  // =====================================================================
  // Note Quiz
  // =====================================================================

  const Notes = {
    id: 'notes',
    sub: store.get('fw.notes.sub', 'find'),
    q: null,
    locked: false,
    last: null,
    statKey() { return 'notes:' + this.sub; },

    enter() {
      setSubmodes([['find', 'Find on a string'], ['name', 'Name the note'], ['all', 'Find them all']], this.sub, v => {
        this.sub = v;
        store.set('fw.notes.sub', v);
        this.enter();
      });
      this.next();
    },

    next() {
      clearTimers();
      this.locked = false;
      fb.clear();
      fb.highlightString(null);
      fb.setInteractive(true);
      applyRange();
      feedback('');
      ui.pad.replaceChildren();
      ui.pad.hidden = true;
      ui.hint.innerHTML = '';
      if (this.sub === 'find') this.nextFind();
      else if (this.sub === 'name') this.nextName();
      else this.nextAll();
      renderStats();
    },

    pickPos(keyOf) {
      let positions = quizPositions();
      if (positions.length > 1 && this.last) positions = positions.filter(p => keyOf(p) !== this.last);
      const pos = weightedPick(positions, p => weightOf(keyOf(p)));
      this.last = keyOf(pos);
      return pos;
    },

    // --- Find a note on a given string
    nextFind() {
      const key = p => `f:${p.s}:${T.pcAt(p.s, p.f)}`;
      const pos = this.pickPos(key);
      const pc = T.pcAt(pos.s, pos.f);
      this.q = { ...pos, pc, name: askName(pc), key: key(pos), t: performance.now() };
      fb.highlightString(pos.s);
      ui.prompt.innerHTML = `Find <b class="hl">${esc(this.q.name)}</b> on the <b>${esc(T.STRING_LONG[pos.s])}</b> string`;
      ui.sub.textContent = `${T.STRING_ORDINAL[pos.s]} string · frets ${settings.minFret}–${quizMax()}`;
      setActions(button('Skip', () => this.next(), { kbd: 'N' }));
    },

    // --- Name the highlighted note
    nextName() {
      const key = p => `n:${p.s}:${p.f}`;
      const pos = this.pickPos(key);
      const pc = T.pcAt(pos.s, pos.f);
      this.q = { ...pos, pc, key: key(pos), t: performance.now() };
      fb.mark(pos.s, pos.f, { label: '?', cls: 'dot-target' });
      fb.scrollToFret(pos.f);
      ui.prompt.innerHTML = 'What note is this?';
      ui.sub.textContent = `${stringLabel(pos.s)}, ${fretLabel(pos.f)}`;
      ui.pad.hidden = false;
      ui.pad.replaceChildren(...range(12).map(n =>
        h('button', { type: 'button', class: T.isNatural(n) ? 'is-natural' : '', dataset: { pc: n }, onclick: () => this.answer(n) }, padName(n))));
      ui.hint.innerHTML = 'Keyboard: <kbd>A</kbd>–<kbd>G</kbd> for naturals, <kbd>Shift</kbd> + letter for sharps, <kbd>N</kbd> to skip.';
      setActions(button('Skip', () => this.next(), { kbd: 'N' }));
    },

    answer(pc) {
      if (this.locked || this.sub !== 'name') return;
      this.locked = true;
      const q = this.q;
      const ms = performance.now() - q.t;
      playPos(q.s, q.f);
      const btnFor = n => ui.pad.querySelector(`[data-pc="${n}"]`);
      const spelled = T.noteName(q.pc, 'both');
      if (pc === q.pc) {
        btnFor(pc).classList.add('is-good');
        fb.mark(q.s, q.f, { label: dotName(q.pc), cls: 'dot-good pop' });
        feedback(`Yes — that's ${esc(spelled)}.`, 'good');
        record(true, ms);
        markWeak(q.key, false);
        later(() => this.next(), 850);
      } else {
        btnFor(pc).classList.add('is-bad');
        btnFor(q.pc).classList.add('is-good');
        fb.mark(q.s, q.f, { label: dotName(q.pc), cls: 'dot-reveal' });
        feedback(`Not quite — it's ${esc(spelled)}, not ${esc(T.noteName(pc, 'both'))}.`, 'bad');
        record(false);
        markWeak(q.key, true);
        setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
        later(() => this.next(), 2200);
      }
    },

    // --- Find every instance of a note
    nextAll() {
      const positions = quizPositions();
      const pcs = range(12).filter(pc => pc !== this.lastPc && positions.some(p => T.pcAt(p.s, p.f) === pc));
      const pc = weightedPick(pcs, n => weightOf('a:' + n));
      this.lastPc = pc;
      const targets = positions.filter(p => T.pcAt(p.s, p.f) === pc);
      this.q = { pc, name: askName(pc), targets, found: new Set(), mistakes: 0, t: performance.now() };
      ui.prompt.innerHTML = `Find every <b class="hl">${esc(this.q.name)}</b>`;
      this.updateAllSub();
      setActions(
        button('Give up', () => this.giveUp()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    updateAllSub() {
      const q = this.q;
      ui.sub.textContent = `${q.found.size} of ${q.targets.length} found` +
        (q.mistakes ? ` · ${q.mistakes} mistake${q.mistakes > 1 ? 's' : ''}` : '') +
        ` · frets ${settings.minFret}–${quizMax()}`;
    },

    giveUp() {
      if (this.locked) return;
      this.locked = true;
      const q = this.q;
      q.targets.forEach(p => { if (!q.found.has(p.s + ':' + p.f)) fb.mark(p.s, p.f, { label: dotName(q.pc), cls: 'dot-reveal' }); });
      feedback(`Here are the ${q.targets.length - q.found.size} you missed.`, 'bad');
      record(false);
      markWeak('a:' + q.pc, true);
      setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
    },

    onCell(s, f, opts = {}) {
      if (this.locked) return;
      const q = this.q;
      const pc = T.pcAt(s, f);
      if (!opts.fromMic) playPos(s, f);
      else fb.pluck(s);

      if (this.sub === 'name') return;

      if (this.sub === 'find') {
        this.locked = true;
        const ms = performance.now() - q.t;
        if (s === q.s && pc === q.pc) {
          fb.mark(s, f, { label: dotName(pc), cls: 'dot-good pop' });
          feedback(`Correct — ${esc(q.name)} is at ${fretLabel(f)} on the ${esc(T.STRING_LONG[s])} string.`, 'good');
          record(true, ms);
          markWeak(q.key, false);
          later(() => this.next(), 900);
        } else {
          fb.mark(s, f, { label: dotName(pc), cls: 'dot-bad shake' });
          for (let f2 = settings.minFret; f2 <= quizMax(); f2++) {
            if (T.pcAt(q.s, f2) === q.pc) fb.mark(q.s, f2, { label: dotName(q.pc), cls: 'dot-reveal' });
          }
          fb.scrollToFret(q.f);
          feedback(pc === q.pc
            ? `That's ${esc(q.name)}, but on the ${esc(T.STRING_LONG[s])} string.`
            : `That's ${esc(T.noteName(pc, 'both'))}. ${esc(q.name)} is at ${fretLabel(q.f)} on the ${esc(T.STRING_LONG[q.s])} string.`, 'bad');
          record(false);
          markWeak(q.key, true);
          setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
          later(() => this.next(), 2400);
        }
        return;
      }

      // Find them all
      const key = s + ':' + f;
      if (q.found.has(key)) return;
      if (pc === q.pc) {
        q.found.add(key);
        q.lastF = f;
        fb.mark(s, f, { label: dotName(pc), cls: 'dot-good pop' });
        this.updateAllSub();
        if (q.found.size === q.targets.length) {
          this.locked = true;
          const ms = performance.now() - q.t;
          const ok = q.mistakes === 0;
          feedback(`All ${q.targets.length} found in ${(ms / 1000).toFixed(1)}s` +
            (ok ? ' — flawless!' : ` with ${q.mistakes} mistake${q.mistakes > 1 ? 's' : ''}.`), ok ? 'good' : 'warn');
          record(ok, ms);
          markWeak('a:' + q.pc, !ok);
          setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
          later(() => this.next(), 2000);
        }
      } else {
        q.mistakes++;
        fb.mark(s, f, { label: dotName(pc), cls: 'dot-bad shake' });
        feedback(`That's ${esc(T.noteName(pc, 'both'))}.`, 'bad');
        this.updateAllSub();
        later(() => { if (this.q === q && !this.locked) fb.unmark(s, f); }, 800);
      }
    },

    onPitch(midi) {
      if (this.locked) return;
      const q = this.q;
      const pc = T.mod(midi, 12);
      const inRange = f => f >= settings.minFret && f <= quizMax();
      if (this.sub === 'name') { this.answer(pc); return; }
      if (this.sub === 'find') {
        const f = midi - T.TUNING[q.s];
        if (f >= 0 && inRange(f)) { this.onCell(q.s, f, { fromMic: true }); return; }
        if (pc === q.pc) {
          feedback(`That's ${esc(q.name)}, but that octave isn't on the ${esc(T.STRING_LONG[q.s])} string between frets ${settings.minFret} and ${quizMax()}.`, 'warn');
          return;
        }
      } else {
        const open = q.targets.filter(p => T.midiAt(p.s, p.f) === midi && !q.found.has(p.s + ':' + p.f));
        if (pc === q.pc) {
          if (open.length) { const p = nearest(open, q.lastF ?? 5); this.onCell(p.s, p.f, { fromMic: true }); }
          else feedback(`You've already found every ${esc(midiName(midi))} — try another octave.`, 'warn');
          return;
        }
      }
      const p = nearest(positionsFor(midi, { inRange: true }), q.f ?? 5) || nearest(positionsFor(midi), q.f ?? 5);
      if (p) this.onCell(p.s, p.f, { fromMic: true });
      else feedback(`Heard ${esc(midiName(midi))} — that's off this neck.`, 'warn');
    },

    onKey(e) {
      if (this.sub !== 'name' || this.locked) return false;
      const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[e.key.toLowerCase()];
      if (base == null || e.ctrlKey || e.metaKey || e.altKey) return false;
      this.answer(T.mod(base + (e.shiftKey ? 1 : 0), 12));
      return true;
    },
  };

  // =====================================================================
  // Chord Quiz
  // =====================================================================

  const Chords = {
    id: 'chords',
    sub: store.get('fw.chords.sub', 'build'),
    q: null,
    locked: false,
    last: null,
    statKey() { return 'chords:' + this.sub; },

    types() {
      const ts = settings.chordTypes.map(T.chordType).filter(Boolean);
      return ts.length ? ts : [T.chordType('maj')];
    },

    pickChord() {
      let opts = [];
      for (const type of this.types()) for (let root = 0; root < 12; root++) opts.push({ root, type, key: `c:${root}:${type.id}` });
      opts = opts.filter(o => o.key !== this.last && T.findVoicings(o.root, o.type, settings.frets).length);
      const c = weightedPick(opts, o => weightOf(o.key));
      this.last = c.key;
      return c;
    },

    enter() {
      setSubmodes([['build', 'Build the chord'], ['name', 'Name the chord'], ['triad', 'Build a triad'], ['triadname', 'Name the triad']], this.sub, v => {
        this.sub = v;
        store.set('fw.chords.sub', v);
        this.enter();
      });
      this.next();
    },

    next() {
      clearTimers();
      this.locked = false;
      fb.clear();
      fb.setRange(null);
      fb.highlightString(null);
      fb.setInteractive(true);
      feedback('');
      ui.controls.replaceChildren();
      ui.pad.replaceChildren();
      ui.pad.hidden = true;
      ui.pad.classList.remove('wide');
      ui.hint.innerHTML = '';
      if (this.sub === 'build') this.nextBuild();
      else if (this.sub === 'name') this.nextName();
      else if (this.sub === 'triad') this.nextTriad();
      else this.nextTriadName();
      renderStats();
    },

    // --- Build the chord on the fretboard
    nextBuild() {
      const c = this.pickChord();
      this.q = { ...c, sel: new Array(6).fill(null), attempts: 0, recorded: false, t: performance.now() };
      ui.prompt.innerHTML = `Play <b class="hl">${esc(T.chordName(c.root, c.type))}</b> <span class="soft">${esc(c.type.name)}</span>`;
      ui.sub.textContent = 'Tap one fret per string (tap again to remove). Strings left empty are muted.' +
        (settings.rootInBass ? ' The root must be the lowest note.' : '');
      ui.hint.innerHTML = '<kbd>Enter</kbd> to check · <kbd>Space</kbd> to hear your shape · <kbd>N</kbd> to skip.';
      this.buildActions();
      this.drawSel();
    },

    buildActions() {
      setActions(
        button('Check', () => this.check(), { cls: 'primary', kbd: 'Enter' }),
        button('Hear it', () => strumShape(this.q.sel), { kbd: 'Space' }),
        button('Clear', () => { this.q.sel.fill(null); Sound.stopAll(); this.drawSel(); feedback(''); }),
        button('Show notes', () => feedback(`${esc(T.chordName(this.q.root, this.q.type))} is spelled ${tonesHtml(this.q.root, this.q.type)}`, 'info')),
        button('Show answer', () => this.showAnswer()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    drawSel() {
      fb.clear();
      this.q.sel.forEach((f, s) => fb.mark(s, f == null ? 0 : f, f == null ? { label: '×', cls: 'dot-mute' } : { cls: 'dot-sel' }));
    },

    check() {
      const q = this.q;
      if (this.locked) { this.next(); return; }
      const r = T.checkShape(q.sel, q.root, q.type, settings.rootInBass);
      if (!r.notes.length) { feedback('Tap some frets first.', 'warn'); return; }
      strumShape(q.sel);
      const tones = T.toneMap(q.root, q.type);
      const name = esc(T.chordName(q.root, q.type));

      if (r.ok) {
        this.locked = true;
        drawShape(q.sel, q.root, q.type);
        fb.forEachCell((c, s, f) => { if (q.sel[s] === f) c.lastChild.classList.add('pop'); });
        feedback(`✓ That's ${name}: ${tonesHtml(q.root, q.type)}${q.attempts ? '' : ' — first try!'}`, 'good');
        if (!q.recorded) { record(true, performance.now() - q.t); markWeak(q.key, false); q.recorded = true; }
        setActions(
          button('Next chord', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
          button('Hear it', () => strumShape(q.sel), { kbd: 'Space' }),
          button('Other shapes', () => this.showAnswer(true)),
        );
        return;
      }

      q.attempts++;
      if (!q.recorded) { record(false); markWeak(q.key, true); q.recorded = true; }
      const problems = [];
      if (r.notes.length < r.minStrings) problems.push(`Use at least ${r.minStrings} strings.`);
      if (r.wrong.length) {
        const names = [...new Set(r.wrong.map(n => T.noteName(n.pc, 'both')))];
        problems.push(`${names.join(', ')} ${names.length > 1 ? "aren't" : "isn't"} in ${name}.`);
      }
      if (r.missing.length) {
        const degree = label => (label === 'R' ? 'root' : label + ({ 2: 'nd', 3: 'rd' }[label.slice(-1)] || 'th'));
        problems.push(`Missing the ${r.missing.map(pc => { const t = tones.get(pc); return `${degree(t.label)} (${t.name})`; }).join(' and ')}.`);
      }
      if (!r.bassOk && r.bass) problems.push(`Your lowest note is ${T.noteName(r.bass.pc, 'both')} — put the root (${tones.get(q.root).name}) in the bass.`);
      if (r.span > 4) problems.push(`That's a ${r.span + 1}-fret stretch — keep it within 5 frets.`);

      // Show which notes are right (with intervals) and which are wrong.
      fb.clear();
      q.sel.forEach((f, s) => {
        if (f == null) { fb.mark(s, 0, { label: '×', cls: 'dot-mute' }); return; }
        const t = tones.get(T.pcAt(s, f));
        fb.mark(s, f, t ? { label: t.label, cls: ivClass(t.semi) } : { label: dotName(T.pcAt(s, f)), cls: 'dot-bad shake' });
      });
      feedback(esc(problems.join(' ')), 'bad');
    },

    showAnswer(afterSuccess = false) {
      const q = this.q;
      const voicings = T.findVoicings(q.root, q.type, settings.frets);
      if (!voicings.length) { feedback('No standard shape fits on this neck.', 'warn'); return; }
      if (!q.recorded) { record(false); markWeak(q.key, true); q.recorded = true; }
      this.locked = true;
      const fretted = q.sel.filter(f => f != null && f > 0);
      const target = fretted.length ? fretted.reduce((a, b) => a + b, 0) / fretted.length : 0;
      let idx = 0;
      voicings.forEach((v, i) => { if (Math.abs(v.position - target) < Math.abs(voicings[idx].position - target)) idx = i; });
      if (afterSuccess) idx = 0;
      const show = i => {
        idx = (i + voicings.length) % voicings.length;
        const v = voicings[idx];
        q.shown = v.frets;
        fb.clear();
        drawShape(v.frets, q.root, q.type);
        fb.scrollToFret(v.position + 1);
        strumShape(v.frets);
        ui.sub.textContent = `Shape ${idx + 1} of ${voicings.length}: ${T.shapeString(v.frets)} · ${v.position === 0 ? 'open position' : 'position ' + v.position}`;
      };
      feedback(`${esc(T.chordName(q.root, q.type))} = ${tonesHtml(q.root, q.type)}`, 'info');
      ui.controls.replaceChildren(legend());
      setActions(
        button('Next chord', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('◀ Shape', () => show(idx - 1)),
        button('Shape ▶', () => show(idx + 1)),
        button('Hear it', () => strumShape(voicings[idx].frets), { kbd: 'Space' }),
      );
      show(idx);
    },

    // --- Name the displayed chord
    nextName() {
      const c = this.pickChord();
      const voicings = T.findVoicings(c.root, c.type, settings.frets);
      const v = pick(voicings);
      this.q = { ...c, frets: v.frets, t: performance.now() };
      drawShape(v.frets, c.root, c.type, { labels: 'none', neutral: true });
      fb.scrollToFret(v.position + 1);
      ui.prompt.innerHTML = 'Name this chord';
      ui.sub.textContent = `Shape ${T.shapeString(v.frets)} · the lowest note is the root.`;
      later(() => strumShape(v.frets), 250);

      const options = shuffle([c, ...this.distractors(c)]);
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      ui.pad.replaceChildren(...options.map((o, i) =>
        h('button', { type: 'button', dataset: { key: o.key }, onclick: () => this.answer(o) },
          T.chordName(o.root, o.type), h('small', null, `${i + 1} · ${o.type.name}`))));
      ui.hint.innerHTML = '<kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>Space</kbd> to strum again · <kbd>N</kbd> to skip.';
      setActions(
        button('Strum', () => strumShape(this.q.frets), { kbd: 'Space' }),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    distractors(c) {
      const sameSet = o => {
        const a = new Set(T.chordPcs(c.root, c.type));
        const b = T.chordPcs(o.root, o.type);
        return b.length === a.size && b.every(p => a.has(p));
      };
      const typePool = this.types().length > 1 ? this.types() : ['maj', 'min', '7'].map(T.chordType);
      const sameRoot = shuffle(typePool.filter(t => t.id !== c.type.id).map(type => ({ root: c.root, type })));
      const sameType = shuffle([-2, -1, 1, 2, 5, 7].map(d => ({ root: T.mod(c.root + d, 12), type: c.type })));
      const mixed = shuffle(typePool.flatMap(type => [-2, 2, 5, 7].map(d => ({ root: T.mod(c.root + d, 12), type }))));
      const out = [];
      const seen = new Set([`c:${c.root}:${c.type.id}`]);
      const names = new Set([T.chordName(c.root, c.type)]);
      const take = o => {
        const key = `c:${o.root}:${o.type.id}`;
        const name = T.chordName(o.root, o.type);
        if (out.length >= 3 || seen.has(key) || names.has(name) || sameSet(o)) return;
        seen.add(key);
        names.add(name);
        out.push({ ...o, key });
      };
      sameRoot.slice(0, 1).forEach(take);
      sameType.slice(0, 1).forEach(take);
      [...mixed, ...sameRoot, ...sameType].forEach(take);
      return out;
    },

    answer(o) {
      if (this.locked || this.sub !== 'name') return;
      this.locked = true;
      const q = this.q;
      const ok = o.key === q.key;
      const btn = ui.pad.querySelector(`[data-key="${o.key}"]`);
      ui.pad.querySelector(`[data-key="${q.key}"]`).classList.add('is-good');
      if (!ok) btn.classList.add('is-bad');
      fb.clear();
      drawShape(q.frets, q.root, q.type);
      strumShape(q.frets);
      ui.controls.replaceChildren(legend());
      const name = esc(T.chordName(q.root, q.type));
      feedback(ok
        ? `✓ ${name} — ${tonesHtml(q.root, q.type)}`
        : `It's ${name} (${esc(q.type.name)}): ${tonesHtml(q.root, q.type)}`, ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak(q.key, !ok);
      setActions(
        button('Next chord', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('Strum', () => strumShape(q.frets), { kbd: 'Space' }),
      );
    },

    // --- Triads on string sets
    triadItems() {
      const types = settings.triadTypes.map(T.chordType).filter(Boolean);
      const sets = settings.triadSets.map(T.stringSet);
      const invs = settings.triadInversions.map(Number);
      const items = [];
      for (const type of types.length ? types : [T.chordType('maj')]) {
        for (let root = 0; root < 12; root++) {
          for (const inv of invs.length ? invs : [0]) {
            for (const set of sets.length ? sets : T.STRING_SETS) {
              const shapes = T.triadShapes(root, type, inv, set, settings.frets);
              if (shapes.length) items.push({ root, type, inv, set, shapes, key: `t:${type.id}:${root}:${inv}:${set.id}` });
            }
          }
        }
      }
      return items;
    },

    pickTriad() {
      const items = this.triadItems();
      let pool = items.filter(i => i.key !== this.last);
      if (!pool.length) pool = items;
      const it = weightedPick(pool, i => weightOf(i.key));
      this.last = it.key;
      return it;
    },

    triadTitle(q) {
      return `<b class="hl">${esc(T.chordName(q.root, q.type))}</b> <span class="soft">${esc(q.type.name)} · ${esc(T.INVERSIONS[q.inv].name)}</span>`;
    },

    /** "1st inversion = 3rd on the bottom: E – G – C" */
    inversionHint(q) {
      const tones = T.toneMap(q.root, q.type);
      const order = T.INVERSIONS[q.inv].order.map(i => tones.get(T.mod(q.root + q.type.iv[i], 12)));
      return `${T.INVERSIONS[q.inv].name}: ${T.degreeName(order[0].label)} on the bottom — ${order.map(t => t.name).join(' – ')} (low to high).`;
    },

    triadFrets(notes) {
      const frets = new Array(6).fill(null);
      notes.forEach(n => { frets[n.s] = n.f; });
      return frets;
    },

    nextTriad() {
      const it = this.pickTriad();
      this.q = { ...it, sel: {}, attempts: 0, recorded: false, t: performance.now() };
      const mask = range(6).map(s => it.set.strings.includes(s));
      fb.setRange(0, settings.frets, mask);
      ui.prompt.innerHTML = `Play ${this.triadTitle(it)}`;
      ui.sub.textContent = `On strings ${it.set.label}, one note per string, all within an octave. It checks itself once each string has a note.`;
      ui.hint.innerHTML = 'Tap a fret again to remove it · <kbd>Space</kbd> to hear your notes · <kbd>N</kbd> to skip.';
      setActions(
        button('Show notes', () => feedback(esc(this.inversionHint(this.q)), 'info')),
        button('Clear', () => { this.q.sel = {}; this.drawTriadSel(); feedback(''); }),
        button('Show answer', () => this.showTriadAnswer()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
      this.drawTriadSel();
      fb.scrollToFret(Math.min(...it.shapes.map(sh => sh.position)));
    },

    selNotes() {
      const q = this.q;
      return q.set.strings.filter(s => q.sel[s] != null).map(s => ({ s, f: q.sel[s], midi: T.midiAt(s, q.sel[s]), pc: T.pcAt(s, q.sel[s]) }));
    },

    drawTriadSel() {
      fb.clear();
      this.selNotes().forEach(n => fb.mark(n.s, n.f, { cls: 'dot-sel' }));
    },

    onCellTriad(s, f) {
      const q = this.q;
      if (!q.set.strings.includes(s)) return;
      q.sel[s] = q.sel[s] === f ? null : f;
      if (q.sel[s] != null) playPos(s, f);
      else Sound.stop('s' + s);
      this.drawTriadSel();
      feedback('');
      if (this.selNotes().length === 3) this.checkTriad();
    },

    checkTriad() {
      const q = this.q;
      const notes = this.selNotes();
      const r = T.checkTriad(notes, q.root, q.type, q.inv);
      const tones = T.toneMap(q.root, q.type);
      const name = T.chordName(q.root, q.type);
      later(() => strumShape(this.triadFrets(notes)), 150);
      fb.clear();
      notes.forEach(n => {
        const t = tones.get(n.pc);
        fb.mark(n.s, n.f, t ? { label: t.label, cls: ivClass(t.semi) + (r.ok ? ' pop' : '') } : { label: dotName(n.pc), cls: 'dot-bad shake' });
      });
      if (r.ok) {
        this.locked = true;
        q.shown = this.triadFrets(notes);
        feedback(`✓ ${esc(name)}, ${esc(T.INVERSIONS[q.inv].name)}${q.attempts ? '' : ' — first try!'}`, 'good');
        if (!q.recorded) { record(true, performance.now() - q.t); markWeak(q.key, false); q.recorded = true; }
        ui.controls.replaceChildren(legend(LEGEND.slice(0, 3)));
        setActions(
          button('Next triad', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
          button('Hear it', () => strumShape(q.shown), { kbd: 'Space' }),
          button('Other shapes', () => this.showTriadAnswer(true)),
        );
        return;
      }
      q.attempts++;
      if (!q.recorded) { record(false); markWeak(q.key, true); q.recorded = true; }
      let msg;
      if (r.wrong.length) {
        const names = [...new Set(r.wrong.map(n => T.noteName(n.pc, 'both')))];
        msg = `${names.join(', ')} ${names.length > 1 ? "aren't" : "isn't"} in ${name}.`;
      } else if (r.missing.length) {
        const t = tones.get(r.missing[0]);
        msg = `You doubled a note — the ${T.degreeName(t.label)} (${t.name}) is missing.`;
      } else if (!r.close) {
        msg = 'Right notes, but spread over more than an octave. Keep all three close together.';
      } else {
        msg = `That's ${name} in ${T.INVERSIONS[r.played].name}. You need ${this.inversionHint(q)}`;
      }
      feedback(esc(msg), 'bad');
    },

    showTriadAnswer(afterSuccess = false) {
      const q = this.q;
      if (!q.recorded) { record(false); markWeak(q.key, true); q.recorded = true; }
      this.locked = true;
      const notes = this.selNotes();
      const target = notes.length ? notes.reduce((a, n) => a + n.f, 0) / notes.length : 0;
      let idx = 0;
      q.shapes.forEach((sh, i) => { if (Math.abs(sh.position - target) < Math.abs(q.shapes[idx].position - target)) idx = i; });
      const show = i => {
        idx = (i + q.shapes.length) % q.shapes.length;
        const sh = q.shapes[idx];
        q.shown = this.triadFrets(sh.notes);
        fb.clear();
        drawShape(q.shown, q.root, q.type);
        fb.scrollToFret(sh.position);
        strumShape(q.shown);
        ui.sub.textContent = `Shape ${idx + 1} of ${q.shapes.length} on strings ${q.set.label} · frets ${T.fretSpan(sh.notes).join('–')}`;
      };
      feedback(esc(this.inversionHint(q)), afterSuccess ? 'good' : 'info');
      ui.controls.replaceChildren(legend(LEGEND.slice(0, 3)));
      setActions(
        button('Next triad', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        q.shapes.length > 1 ? button('◀ Shape', () => show(idx - 1)) : null,
        q.shapes.length > 1 ? button('Shape ▶', () => show(idx + 1)) : null,
        button('Hear it', () => strumShape(q.shown), { kbd: 'Space' }),
      );
      show(idx);
    },

    nextTriadName() {
      const it = this.pickTriad();
      const shape = pick(it.shapes);
      this.q = { ...it, shape, frets: this.triadFrets(shape.notes), t: performance.now() };
      shape.notes.forEach(n => fb.mark(n.s, n.f, { cls: 'dot-note' }));
      fb.scrollToFret(shape.position);
      ui.prompt.innerHTML = 'Name this triad';
      ui.sub.textContent = `Strings ${it.set.label}. Which chord, and which chord tone is on the bottom?`;
      later(() => strumShape(this.q.frets), 250);

      // Distractors: the same chord in other inversions (the real skill), then other qualities.
      const opts = [it];
      const add = o => {
        const key = `t:${o.type.id}:${o.root}:${o.inv}:${it.set.id}`;
        if (opts.length < 4 && !opts.some(x => x.key === key)) opts.push({ ...o, set: it.set, key });
      };
      shuffle([0, 1, 2].filter(i => i !== it.inv)).forEach(inv => add({ root: it.root, type: it.type, inv }));
      const others = shuffle(T.TRIAD_TYPES.filter(t => t.id !== it.type.id));
      others.forEach(type => add({ root: it.root, type, inv: it.inv }));
      const options = shuffle(opts);
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      ui.pad.replaceChildren(...options.map((o, i) =>
        h('button', { type: 'button', dataset: { key: o.key }, onclick: () => this.answerTriad(o) },
          `${T.chordName(o.root, o.type)} · ${T.INVERSIONS[o.inv].short}`, h('small', null, `${i + 1} · ${o.type.name}, ${T.INVERSIONS[o.inv].name}`))));
      ui.hint.innerHTML = '<kbd>1</kbd>–<kbd>4</kbd> to answer · <kbd>Space</kbd> to strum again · <kbd>N</kbd> to skip.';
      setActions(
        button('Strum', () => strumShape(this.q.frets), { kbd: 'Space' }),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    answerTriad(o) {
      if (this.locked || this.sub !== 'triadname') return;
      this.locked = true;
      const q = this.q;
      const ok = o.key === q.key;
      ui.pad.querySelector(`[data-key="${q.key}"]`).classList.add('is-good');
      if (!ok) ui.pad.querySelector(`[data-key="${o.key}"]`).classList.add('is-bad');
      fb.clear();
      drawShape(q.frets, q.root, q.type);
      strumShape(q.frets);
      ui.controls.replaceChildren(legend(LEGEND.slice(0, 3)));
      feedback((ok ? '✓ ' : "It's ") + esc(`${T.chordName(q.root, q.type)} — ${this.inversionHint(q)}`), ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak(q.key, !ok);
      setActions(
        button('Next triad', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('Strum', () => strumShape(q.frets), { kbd: 'Space' }),
      );
    },

    currentFrets() {
      const q = this.q;
      if (this.sub === 'build') return this.locked && q.shown ? q.shown : q.sel;
      if (this.sub === 'triad') return q.shown || this.triadFrets(this.selNotes());
      return q.frets;
    },

    onCell(s, f) {
      const q = this.q;
      if (this.locked || this.sub === 'name' || this.sub === 'triadname') { playPos(s, f); return; }
      if (this.sub === 'triad') { this.onCellTriad(s, f); return; }
      q.sel[s] = q.sel[s] === f ? null : f;
      if (q.sel[s] != null) playPos(s, f);
      else Sound.stop('s' + s);
      this.drawSel();
      feedback('');
    },

    onKey(e) {
      if (e.key === ' ') { strumShape(this.currentFrets()); return true; }
      if (e.key === 'Enter') {
        if (this.sub === 'build') this.check();
        else if (this.locked) this.next();
        return true;
      }
      if ((this.sub === 'name' || this.sub === 'triadname') && !this.locked && /^[1-4]$/.test(e.key)) {
        const b = ui.pad.children[+e.key - 1];
        if (b) b.click();
        return true;
      }
      return false;
    },
  };

  // =====================================================================
  // Ear Training (find a note, phrases, intervals by ear, chord quality)
  // =====================================================================

  const Ear = {
    id: 'ear',
    sub: store.get('fw.ear.sub', 'named'), // 'named' | 'blind' | 'phrase' | 'interval' | 'chord'
    q: null,
    locked: false,
    lastKey: null,
    statKey() { return 'ear:' + this.sub; },
    supportsMic() { return ['named', 'blind', 'phrase'].includes(this.sub); },

    enter() {
      setSubmodes([
        ['named', 'Find the note'],
        ['blind', 'Note by ear'],
        ['phrase', 'Phrases'],
        ['interval', 'Intervals'],
        ['chord', 'Chord quality'],
      ], this.sub, v => {
        this.sub = v;
        store.set('fw.ear.sub', v);
        this.enter();
      });
      this.next();
    },

    next() {
      clearTimers();
      Sound.stopAll();
      this.locked = false;
      fb.clear();
      fb.highlightString(null);
      fb.setInteractive(true);
      feedback('');
      ui.controls.replaceChildren();
      ui.pad.replaceChildren();
      ui.pad.hidden = true;
      ui.pad.classList.remove('wide');
      if (this.sub === 'named' || this.sub === 'blind') { applyRange(); this.nextNote(); }
      else if (this.sub === 'phrase') { applyRange(); this.nextPhrase(); }
      else if (this.sub === 'interval') { fb.setRange(null); this.nextInterval(); }
      else { fb.setRange(null); this.nextChord(); }
      renderStats();
    },

    /** Replay whatever the current question is. */
    play() {
      const q = this.q;
      if (!q) return;
      if (this.sub === 'phrase') this.playPhrase();
      else if (this.sub === 'interval') this.playInterval();
      else if (this.sub === 'chord') strumShape(q.frets);
      else Sound.play(q.midi, { key: 'target' });
      const b = ui.actions.querySelector('.btn.primary');
      if (b) { b.classList.remove('is-playing'); void b.offsetWidth; b.classList.add('is-playing'); }
    },

    reference() { Sound.play(T.TUNING[1], { key: 'ref' }); },
    referenceButton() {
      return button(`Reference ${midiName(T.TUNING[1])}`, () => this.reference(), { kbd: 'R', title: 'Plays the open 5th string' });
    },

    // --- Find a single note (named, or by ear only)
    nextNote() {
      let positions = quizPositions();
      if (positions.length > 1) positions = positions.filter(p => T.midiAt(p.s, p.f) !== this.lastKey);
      const pos = weightedPick(positions, p => weightOf('e:' + T.midiAt(p.s, p.f)));
      const midi = T.midiAt(pos.s, pos.f);
      this.lastKey = midi;
      this.q = { midi, f: pos.f, attempts: 0, recorded: false, t: performance.now() };
      if (this.sub === 'named') {
        ui.prompt.innerHTML = `Find <b class="hl">${esc(midiName(midi))}</b>`;
        ui.sub.textContent = 'Match the exact pitch — the octave matters, but any string works.';
      } else {
        ui.prompt.innerHTML = 'Find the note you hear';
        ui.sub.textContent = `Tap frets to compare against it. The reference plays the open 5th string (${midiName(T.TUNING[1])}).`;
      }
      ui.hint.innerHTML = '<kbd>Space</kbd> replays the note · <kbd>R</kbd> plays the reference · <kbd>N</kbd> skips. Wrong guesses tell you to go higher or lower.';
      setActions(
        button('▶ Play note', () => this.play(), { cls: 'primary', kbd: 'Space' }),
        this.referenceButton(),
        button('Reveal', () => this.revealNote()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
      later(() => this.play(), 350);
    },

    revealNote() {
      if (this.locked) return;
      this.locked = true;
      const q = this.q;
      positionsFor(q.midi).forEach(p => fb.mark(p.s, p.f, { label: midiName(q.midi), cls: 'dot-reveal' }));
      fb.scrollToFret(q.f);
      this.play();
      feedback(`It was ${esc(midiName(q.midi))}.`, 'bad');
      if (!q.recorded) { record(false); markWeak('e:' + q.midi, true); q.recorded = true; }
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('▶ Play note', () => this.play(), { kbd: 'Space' }),
      );
    },

    /** Higher/lower advice for a wrong guess. */
    hint(want, got) {
      const diff = want - got;
      const dir = diff > 0 ? 'higher' : 'lower';
      if (diff % 12 === 0) {
        const n = Math.abs(diff) / 12;
        return `Right note, wrong octave — go ${n > 1 ? n + ' octaves' : 'an octave'} ${diff > 0 ? 'up' : 'down'}.`;
      }
      if (Math.abs(diff) <= 2) return `Close! A touch ${dir}.`;
      return `${dir[0].toUpperCase() + dir.slice(1)} ${diff > 0 ? '↑' : '↓'}`;
    },

    onCellNote(s, f) {
      const q = this.q;
      const m = T.midiAt(s, f);
      if (m === q.midi) {
        this.locked = true;
        const others = positionsFor(m).filter(p => p.s !== s);
        others.forEach(p => fb.mark(p.s, p.f, { label: midiName(m), cls: 'dot-good is-echo' }));
        fb.mark(s, f, { label: midiName(m), cls: 'dot-good pop' });
        const where = others.map(p => `${T.STRING_LONG[p.s]} string ${fretLabel(p.f)}`).join(', ');
        feedback(`✓ ${esc(midiName(m))}!` + (others.length ? ` The same pitch also lives on the ${esc(where)}.` : ''), 'good');
        if (!q.recorded) {
          record(q.attempts === 0, performance.now() - q.t);
          markWeak('e:' + q.midi, q.attempts > 0);
          q.recorded = true;
        }
        setActions(
          button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
          button('▶ Play note', () => this.play(), { kbd: 'Space' }),
        );
        later(() => this.next(), 2600);
        return;
      }
      q.attempts++;
      fb.mark(s, f, { label: midiName(m), cls: 'dot-bad shake' });
      const left = 3 - q.attempts;
      feedback(`${esc(this.hint(q.midi, m))} <span class="soft">${left > 0 ? `${left} ${left === 1 ? 'try' : 'tries'} left` : ''}</span>`, 'warn');
      if (left <= 0) later(() => this.revealNote(), 900);
      else later(() => this.play(), 750); // replay the target for comparison
    },

    // --- Phrases: hear a short melody and play it back
    nextPhrase() {
      const positions = quizPositions();
      const midis = [...new Set(positions.map(p => T.midiAt(p.s, p.f)))].sort((a, b) => a - b);
      const middle = midis.slice(Math.floor(midis.length * 0.2), Math.ceil(midis.length * 0.75));
      const start = pick(middle.length ? middle : midis);
      const scale = T.scaleType(pick(['minpent', 'majpent']));
      const pcs = scale.iv.map(i => T.mod(start + i, 12));
      const pool = midis.filter(m => pcs.includes(T.mod(m, 12)));
      const seq = [start];
      while (seq.length < settings.phraseLength) {
        const prev = seq[seq.length - 1];
        const opts = pool.filter(m => m !== prev && Math.abs(m - prev) <= 7);
        if (!opts.length) break;
        seq.push(weightedPick(opts, m => 1 / Math.abs(m - prev))); // mostly steps, some leaps
      }
      const first = pick(positionsFor(start, { inRange: true }));
      this.q = { seq, idx: 1, tries: 0, mistakes: 0, revealed: 0, last: first, done: new Set([first.s + ':' + first.f]), t: performance.now() };
      fb.mark(first.s, first.f, { label: '1', cls: 'dot-accent pop' });
      fb.scrollToFret(first.f);
      ui.prompt.innerHTML = `Play back the <b class="hl">${seq.length}-note</b> phrase`;
      this.phraseSub();
      ui.hint.innerHTML = '<kbd>Space</kbd> replays the phrase · <kbd>R</kbd> plays the reference · <kbd>N</kbd> skips. Change the phrase length in Settings.';
      setActions(
        button('▶ Play phrase', () => this.play(), { cls: 'primary', kbd: 'Space' }),
        button('Reveal next note', () => this.revealPhraseNote()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
      later(() => this.play(), 400);
    },

    phraseSub() {
      const q = this.q;
      ui.sub.textContent = `It starts on ${midiName(q.seq[0])} (marked 1). Find notes ${q.idx + 1}–${q.seq.length} in order.` +
        (q.mistakes ? ` · ${q.mistakes} wrong` : '');
    },

    playPhrase() {
      Sound.stopAll();
      Sound.sequence(this.q.seq.map(midi => ({ midi, key: 'phrase' })), 0.48);
    },

    onCellPhrase(s, f) {
      const q = this.q;
      const key = s + ':' + f;
      if (q.done.has(key)) return;
      const want = q.seq[q.idx];
      const m = T.midiAt(s, f);
      if (m === want) {
        q.done.add(key);
        fb.mark(s, f, { label: String(q.idx + 1), cls: 'dot-good pop' });
        q.last = { s, f };
        q.idx++;
        q.tries = 0;
        feedback('');
        if (q.idx === q.seq.length) this.completePhrase();
        else this.phraseSub();
        return;
      }
      q.tries++;
      q.mistakes++;
      fb.mark(s, f, { label: midiName(m), cls: 'dot-bad shake' });
      later(() => { if (this.q === q && !q.done.has(key)) fb.unmark(s, f); }, 900);
      feedback(`Note ${q.idx + 1}: ${esc(this.hint(want, m))}`, 'warn');
      this.phraseSub();
      if (q.tries >= 3) later(() => this.revealPhraseNote(), 700);
    },

    revealPhraseNote() {
      const q = this.q;
      if (this.locked || this.sub !== 'phrase') return;
      const want = q.seq[q.idx];
      const p = nearest(positionsFor(want, { inRange: true }), q.last.f) || nearest(positionsFor(want), q.last.f);
      q.done.add(p.s + ':' + p.f);
      fb.mark(p.s, p.f, { label: String(q.idx + 1), cls: 'dot-reveal' });
      feedback(`Note ${q.idx + 1} was ${esc(midiName(want))}.`, 'bad');
      q.revealed++;
      q.last = p;
      q.idx++;
      q.tries = 0;
      if (q.idx === q.seq.length) this.completePhrase();
      else this.phraseSub();
    },

    completePhrase() {
      const q = this.q;
      this.locked = true;
      const ok = !q.mistakes && !q.revealed;
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak('ep:' + q.seq.length, !ok);
      const names = q.seq.map(midiName).join(' – ');
      feedback(ok ? `✓ Perfect: ${esc(names)}` : `Phrase: ${esc(names)}` + (q.revealed ? ` (${q.revealed} revealed)` : ''), ok ? 'good' : 'warn');
      ui.sub.textContent = 'Listen once more while you look at the shape it makes.';
      later(() => this.playPhrase(), 500);
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('▶ Play phrase', () => this.play(), { kbd: 'Space' }),
      );
    },

    // --- Intervals by ear
    intervals() {
      const list = settings.intervals.map(Number).map(T.interval).filter(Boolean);
      return list.length ? list : T.INTERVALS;
    },

    nextInterval() {
      const list = this.intervals();
      let iv = weightedPick(list, i => weightOf('ei:' + i.semi));
      if (list.length > 1 && iv.semi === this.lastKey) iv = weightedPick(list.filter(i => i.semi !== iv.semi), i => weightOf('ei:' + i.semi));
      this.lastKey = iv.semi;
      const style = settings.earIntervalStyle === 'mixed' ? pick(['up', 'down', 'together']) : settings.earIntervalStyle;
      const low = T.TUNING[0] + 5 + rand(14);
      this.q = { iv, style, low, high: low + iv.semi, t: performance.now() };
      ui.prompt.innerHTML = 'Name the interval';
      ui.sub.textContent = { up: 'Two notes, rising.', down: 'Two notes, falling.', together: 'Two notes played together.' }[style];
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      ui.pad.replaceChildren(...list.map((i, n) =>
        h('button', { type: 'button', dataset: { semi: i.semi }, onclick: () => this.answerInterval(i.semi) },
          i.short, h('small', null, `${n < 9 ? n + 1 + ' · ' : ''}${i.name}`))));
      ui.hint.innerHTML = '<kbd>Space</kbd> replays · <kbd>1</kbd>–<kbd>9</kbd> answer · <kbd>N</kbd> skips. Choose intervals and playback style in Settings.';
      setActions(
        button('▶ Play again', () => this.play(), { cls: 'primary', kbd: 'Space' }),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
      later(() => this.play(), 350);
    },

    playInterval() {
      const q = this.q;
      Sound.stopAll();
      const [a, b] = q.style === 'down' ? [q.high, q.low] : [q.low, q.high];
      const gap = q.style === 'together' ? 0 : 0.7;
      Sound.play(a, { key: 'iv1' });
      Sound.play(b, { key: 'iv2', when: gap });
    },

    answerInterval(semi) {
      if (this.locked || this.sub !== 'interval') return;
      this.locked = true;
      const q = this.q;
      const ok = semi === q.iv.semi;
      ui.pad.querySelector(`[data-semi="${q.iv.semi}"]`).classList.add('is-good');
      if (!ok) ui.pad.querySelector(`[data-semi="${semi}"]`).classList.add('is-bad');
      // Show one way to play it: the closest pair of positions.
      let best = null;
      for (const a of positionsFor(q.low)) {
        for (const b of positionsFor(q.high)) {
          const cost = Math.abs(a.f - b.f) + (a.s === b.s ? 3 : 0) + a.f * 0.05;
          if (!best || cost < best.cost) best = { a, b, cost };
        }
      }
      if (best) {
        fb.mark(best.a.s, best.a.f, { label: 'R', cls: 'iv-r' });
        fb.mark(best.b.s, best.b.f, { label: q.iv.short, cls: ok ? 'dot-good pop' : 'dot-reveal' });
        fb.scrollToFret(best.a.f);
      }
      feedback(ok
        ? `✓ ${esc(q.iv.name)} (${esc(midiName(q.low))} → ${esc(midiName(q.high))})`
        : `It was a ${esc(q.iv.name)}, not a ${esc(T.interval(semi).name)}.`, ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak('ei:' + q.iv.semi, !ok);
      if (!ok) later(() => this.playInterval(), 300);
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('▶ Play again', () => this.play(), { kbd: 'Space' }),
      );
      later(() => this.next(), ok ? 1800 : 3600);
    },

    // --- Chord quality by ear
    chordTypes() {
      const ts = settings.earChords.map(T.chordType).filter(Boolean);
      return ts.length ? ts : ['maj', 'min'].map(T.chordType);
    },

    nextChord() {
      const types = this.chordTypes();
      let c = null;
      for (let tries = 0; tries < 40 && !c; tries++) {
        const type = weightedPick(types, t => weightOf('ec:' + t.id));
        if (types.length > 1 && type.id === this.lastKey) continue;
        const root = rand(12);
        const vs = T.findVoicings(root, type, settings.frets);
        const low = vs.filter(v => v.position <= 9);
        if (vs.length) c = { type, root, v: pick(low.length ? low : vs) };
      }
      if (!c) c = { type: T.chordType('maj'), root: 0, v: T.findVoicings(0, T.chordType('maj'), settings.frets)[0] };
      this.lastKey = c.type.id;
      this.q = { ...c, frets: c.v.frets, t: performance.now() };
      ui.prompt.innerHTML = 'What kind of chord is this?';
      ui.sub.textContent = 'Listen for the colour — bright, dark, tense, dreamy… The root changes every time.';
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      ui.pad.replaceChildren(...types.map((t, n) =>
        h('button', { type: 'button', dataset: { id: t.id }, onclick: () => this.answerChord(t.id) },
          t.name, h('small', null, `${n < 9 ? n + 1 + ' · ' : ''}${t.symbol ? 'C' + t.symbol : 'C'}`))));
      ui.hint.innerHTML = '<kbd>Space</kbd> strums again · <kbd>1</kbd>–<kbd>9</kbd> answer · <kbd>N</kbd> skips. Pick the chord types in Settings.';
      setActions(
        button('▶ Strum', () => this.play(), { cls: 'primary', kbd: 'Space' }),
        button('Arpeggiate', () => {
          const notes = [];
          this.q.frets.forEach((f, s) => { if (f != null) notes.push({ midi: T.midiAt(s, f), key: 's' + s }); });
          Sound.stopAll();
          Sound.sequence(notes, 0.28);
        }),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
      later(() => this.play(), 350);
    },

    answerChord(id) {
      if (this.locked || this.sub !== 'chord') return;
      this.locked = true;
      const q = this.q;
      const ok = id === q.type.id;
      ui.pad.querySelector(`[data-id="${q.type.id}"]`).classList.add('is-good');
      if (!ok) ui.pad.querySelector(`[data-id="${id}"]`).classList.add('is-bad');
      drawShape(q.frets, q.root, q.type);
      fb.scrollToFret(q.v.position + 1);
      ui.controls.replaceChildren(legend());
      const name = esc(T.chordName(q.root, q.type));
      feedback(ok ? `✓ ${name} — ${esc(q.type.name)}: ${tonesHtml(q.root, q.type)}`
        : `It was ${name}, a ${esc(q.type.name)} chord: ${tonesHtml(q.root, q.type)}`, ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak('ec:' + q.type.id, !ok);
      strumShape(q.frets);
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('▶ Strum', () => this.play(), { kbd: 'Space' }),
      );
    },

    // --- Input
    onCell(s, f, opts = {}) {
      if (!opts.fromMic) playPos(s, f);
      else fb.pluck(s);
      if (this.locked) return;
      if (this.sub === 'named' || this.sub === 'blind') this.onCellNote(s, f);
      else if (this.sub === 'phrase') this.onCellPhrase(s, f);
    },

    onPitch(midi) {
      if (this.locked) return;
      if (this.sub === 'phrase') {
        const q = this.q;
        const p = nearest(positionsFor(midi, { inRange: true }), q.last.f) || nearest(positionsFor(midi), q.last.f);
        if (p) this.onCell(p.s, p.f, { fromMic: true });
        return;
      }
      const p = nearest(positionsFor(midi, { inRange: true }), this.q.f) || nearest(positionsFor(midi), this.q.f);
      if (p) this.onCell(p.s, p.f, { fromMic: true });
      else feedback(`Heard ${esc(midiName(midi))} — that's off this neck.`, 'warn');
    },

    onKey(e) {
      if (e.key === ' ') { this.play(); return true; }
      if (e.key.toLowerCase() === 'r' && ['named', 'blind', 'phrase'].includes(this.sub)) { this.reference(); return true; }
      if (e.key === 'Enter' && this.locked) { this.next(); return true; }
      if ((this.sub === 'interval' || this.sub === 'chord') && !this.locked && /^[1-9]$/.test(e.key)) {
        const b = ui.pad.children[+e.key - 1];
        if (b) b.click();
        return true;
      }
      return false;
    },
  };

  // =====================================================================
  // Interval Quiz (on the fretboard)
  // =====================================================================

  const Intervals = {
    id: 'intervals',
    sub: store.get('fw.intervals.sub', 'find'), // 'find' | 'name'
    q: null,
    locked: false,
    last: null,
    statKey() { return 'intervals:' + this.sub; },
    supportsMic() { return this.sub === 'find'; },

    list() {
      const l = settings.intervals.map(Number).map(T.interval).filter(Boolean);
      return l.length ? l : T.INTERVALS;
    },

    enter() {
      setSubmodes([['find', 'Find the interval'], ['name', 'Name the interval']], this.sub, v => {
        this.sub = v;
        store.set('fw.intervals.sub', v);
        this.enter();
      });
      this.next();
    },

    next() {
      clearTimers();
      this.locked = false;
      fb.clear();
      fb.highlightString(null);
      fb.setInteractive(true);
      applyRange();
      feedback('');
      ui.controls.replaceChildren();
      ui.pad.replaceChildren();
      ui.pad.hidden = true;
      ui.pad.classList.remove('wide');
      const q = this.pickQuestion();
      this.q = { ...q, t: performance.now() };
      if (this.sub === 'find') this.nextFind();
      else this.nextName();
      renderStats();
    },

    pickQuestion() {
      const positions = quizPositions();
      let fallback = null;
      for (let tries = 0; tries < 300; tries++) {
        const iv = weightedPick(this.list(), i => weightOf(`iv-${this.sub}:${i.semi}`));
        const dir = settings.intervalBelow && Math.random() < 0.5 ? -1 : 1;
        const root = pick(positions);
        const rootMidi = T.midiAt(root.s, root.f);
        const target = rootMidi + dir * iv.semi;
        // A tiny quiz range may not contain the interval; after many tries, allow the whole neck.
        const targets = positionsFor(target, { inRange: tries < 200 });
        if (!targets.length) continue;
        const q = { iv, dir, root, rootMidi, target, targets, key: `iv-${this.sub}:${iv.semi}` };
        const id = `${root.s}:${root.f}:${iv.semi}:${dir}`;
        if (id === this.last) { fallback = q; continue; }
        this.last = id;
        return q;
      }
      return fallback;
    },

    dirWord() { return this.q.dir > 0 ? 'above' : 'below'; },

    // --- Find the interval from a marked root
    nextFind() {
      const q = this.q;
      fb.mark(q.root.s, q.root.f, { label: 'R', cls: 'iv-r pop' });
      fb.scrollToFret(q.root.f);
      ui.prompt.innerHTML = `Find the <b class="hl">${esc(q.iv.name)}</b> ${this.dirWord()} <b>${esc(askName(T.mod(q.rootMidi, 12)))}</b>`;
      ui.sub.textContent = `The root is on the ${T.STRING_LONG[q.root.s]} string, ${fretLabel(q.root.f)}. Any string works — the exact pitch counts.`;
      ui.hint.innerHTML = 'The shapes closest to the root are the ones worth memorising. <kbd>N</kbd> skips.';
      setActions(
        button('Hear it', () => this.playPair(), { title: 'Play the root, then the interval' }),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    playPair() {
      const q = this.q;
      Sound.play(q.rootMidi, { key: 'iv1' });
      Sound.play(q.target, { key: 'iv2', when: 0.6 });
    },

    onCell(s, f, opts = {}) {
      if (!opts.fromMic) playPos(s, f);
      else fb.pluck(s);
      const q = this.q;
      if (this.sub !== 'find' || this.locked) return;
      if (s === q.root.s && f === q.root.f) return;
      const m = T.midiAt(s, f);
      this.locked = true;
      const targetName = midiName(q.target);
      if (m === q.target) {
        fb.mark(s, f, { label: q.iv.short, cls: 'dot-good pop' });
        const others = q.targets.filter(p => !(p.s === s && p.f === f));
        others.forEach(p => fb.mark(p.s, p.f, { label: q.iv.short, cls: 'dot-good is-echo' }));
        feedback(`✓ ${esc(targetName)} is the ${esc(q.iv.name)} ${this.dirWord()} ${esc(midiName(q.rootMidi))}.` +
          (others.length ? ' The lighter dots are the same pitch on other strings.' : ''), 'good');
        record(true, performance.now() - q.t);
        markWeak(q.key, false);
        later(() => this.next(), 1700);
      } else {
        fb.mark(s, f, { label: intervalShort(m - q.rootMidi), cls: 'dot-bad shake' });
        q.targets.forEach(p => fb.mark(p.s, p.f, { label: q.iv.short, cls: 'dot-reveal' }));
        feedback(`That's ${esc(describeInterval(m - q.rootMidi))} (${esc(midiName(m))}). The ${esc(q.iv.name)} ${this.dirWord()} is ${esc(targetName)}.`, 'bad');
        record(false);
        markWeak(q.key, true);
        setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
        later(() => this.next(), 3000);
      }
    },

    onPitch(midi) {
      if (this.sub !== 'find' || this.locked) return;
      const q = this.q;
      if (midi === q.rootMidi) { feedback(`That's the root (${esc(midiName(midi))}). Now play the ${esc(q.iv.name)} ${this.dirWord()} it.`, 'info'); return; }
      const p = nearest(positionsFor(midi, { inRange: true }), q.root.f) || nearest(positionsFor(midi), q.root.f);
      if (p) this.onCell(p.s, p.f, { fromMic: true });
      else feedback(`Heard ${esc(midiName(midi))} — that's off this neck.`, 'warn');
    },

    // --- Name the interval between two marked notes
    nextName() {
      const q = this.q;
      const near = q.targets.filter(p => Math.abs(p.f - q.root.f) <= 4 && p.s !== q.root.s);
      q.at = pick(near.length ? near : q.targets);
      fb.mark(q.root.s, q.root.f, { label: 'R', cls: 'iv-r' });
      fb.mark(q.at.s, q.at.f, { label: '?', cls: 'dot-target' });
      fb.scrollToFret(Math.min(q.root.f, q.at.f));
      ui.prompt.innerHTML = `What interval is <b class="hl">?</b> ${this.dirWord()} the root?`;
      ui.sub.textContent = `Root: ${midiName(q.rootMidi)} on the ${T.STRING_LONG[q.root.s]} string.`;
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      ui.pad.replaceChildren(...this.list().map((i, n) =>
        h('button', { type: 'button', dataset: { semi: i.semi }, onclick: () => this.answer(i.semi) },
          i.short, h('small', null, `${n < 9 ? n + 1 + ' · ' : ''}${i.name}`))));
      ui.hint.innerHTML = '<kbd>1</kbd>–<kbd>9</kbd> answer · <kbd>N</kbd> skips. Choose which intervals appear in Settings.';
      setActions(
        button('Hear it', () => this.playPair()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    answer(semi) {
      if (this.locked || this.sub !== 'name') return;
      this.locked = true;
      const q = this.q;
      const ok = semi === q.iv.semi;
      ui.pad.querySelector(`[data-semi="${q.iv.semi}"]`).classList.add('is-good');
      if (!ok) ui.pad.querySelector(`[data-semi="${semi}"]`).classList.add('is-bad');
      fb.mark(q.at.s, q.at.f, { label: q.iv.short, cls: ok ? 'dot-good pop' : 'dot-reveal' });
      this.playPair();
      feedback(ok
        ? `✓ ${esc(q.iv.name)}: ${esc(midiName(q.rootMidi))} → ${esc(midiName(q.target))}.`
        : `It's a ${esc(q.iv.name)} (${esc(midiName(q.rootMidi))} → ${esc(midiName(q.target))}), not a ${esc(T.interval(semi).name)}.`, ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak(q.key, !ok);
      setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
      later(() => this.next(), ok ? 1500 : 3000);
    },

    onKey(e) {
      if (this.sub === 'name' && !this.locked && /^[1-9]$/.test(e.key)) {
        const b = ui.pad.children[+e.key - 1];
        if (b) b.click();
        return true;
      }
      return false;
    },
  };

  // =====================================================================
  // Scale Quiz (pentatonic boxes & arpeggio shapes)
  // =====================================================================

  const Shapes = {
    id: 'shapes',
    family: store.get('fw.shapes.family', 'pent'), // 'pent' | 'arp'
    sub: store.get('fw.shapes.sub', 'play'),       // 'play' | 'degree'
    q: null,
    locked: false,
    last: null,
    statKey() { return `shapes:${this.family}:${this.sub}`; },

    enter() {
      setSubmodes([['pent', 'Pentatonics'], ['arp', 'Arpeggios']], this.family, v => {
        this.family = v;
        store.set('fw.shapes.family', v);
        this.enter();
      });
      this.next();
    },

    types() {
      const ids = this.family === 'pent' ? settings.scaleTypes : settings.arpTypes;
      const ts = ids.map(id => (this.family === 'pent' ? T.scaleType(id) : T.ARP_TYPES.find(t => t.id === id))).filter(Boolean);
      return ts.length ? ts : [familyType(this.family, this.family === 'pent' ? 'minpent' : 'min')];
    },

    pickItem() {
      const allowed = this.family === 'pent' && settings.pentShapes.length ? settings.pentShapes : null;
      const items = [];
      for (const type of this.types()) {
        for (let root = 0; root < 12; root++) {
          const extra = this.family === 'pent' && settings.pentExtended ? T.extendedShapes(root, type, settings.frets).filter(sh => !sh.truncated) : [];
          for (const sh of [...T.positionShapes(root, type, settings.frets), ...extra]) {
            if (allowed && !sh.extended && !allowed.includes(sh.index + 1)) continue;
            items.push({ type, root, sh, key: `${this.family}-${this.sub}:${type.id}:${root}:${sh.extended ? 'x' : ''}${sh.index}` });
          }
        }
      }
      let pool = items.filter(i => i.key !== this.last);
      if (!pool.length) pool = items;
      const it = weightedPick(pool, i => weightOf(i.key));
      this.last = it.key;
      return it;
    },

    next() {
      clearTimers();
      Sound.stopAll();
      this.locked = false;
      fb.clear();
      fb.setRange(null);
      fb.highlightString(null);
      fb.setInteractive(true);
      feedback('');
      ui.pad.replaceChildren();
      ui.pad.hidden = true;
      ui.pad.classList.remove('wide');
      ui.controls.replaceChildren(h('div', { class: 'segmented' },
        segmented([['play', 'Play the shape'], ['degree', 'Name the degree']], this.sub, v => {
          this.sub = v;
          store.set('fw.shapes.sub', v);
          this.next();
        })));
      const it = this.pickItem();
      const notes = pick(it.sh.placements);
      this.q = { ...it, notes, tones: T.toneMap(it.root, it.type), t: performance.now() };
      if (this.sub === 'play') this.nextPlay();
      else this.nextDegree();
      renderStats();
    },

    // --- Play the shape: tap every note of the box, starting from the given note
    nextPlay() {
      const q = this.q;
      const first = q.notes[0];
      const start = q.tones.get(first.pc);
      q.found = new Set([first.s + ':' + first.f]);
      q.mistakes = 0;
      q.base = `Starts on the ${T.degreeName(start.label)} (${start.name}) at ${fretLabel(first.f)} on the ${T.STRING_LONG[0]} string and climbs to the ${T.STRING_LONG[5]} string.`;
      ui.prompt.innerHTML = `Play ${shapeTitle(this.family, q.root, q.type)} <span class="soft">· ${shapeName(q.sh)}</span>`;
      markTone(first, this.family, q.type, q.tones, { extra: 'pop' });
      fb.scrollToFret(first.f);
      this.updateProgress();
      ui.hint.innerHTML = `Tap every note of the shape. Notes of the ${this.family === 'pent' ? 'scale' : 'chord'}` +
        ' that sit outside this box are not counted against you. <kbd>N</kbd> skips.';
      setActions(
        button('Show shape', () => this.revealShape()),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    updateProgress() {
      const q = this.q;
      ui.sub.textContent = `${q.base} ${q.found.size} of ${q.notes.length} found` +
        (q.mistakes ? ` · ${q.mistakes} mistake${q.mistakes > 1 ? 's' : ''}` : '') + '.';
    },

    completeShape() {
      const q = this.q;
      this.locked = true;
      const ms = performance.now() - q.t;
      const ok = q.mistakes === 0;
      record(ok, ms);
      markWeak(q.key, !ok);
      feedback(`✓ ${shapeName(q.sh, true)} complete in ${(ms / 1000).toFixed(1)}s` +
        (ok ? ' — no mistakes!' : ` with ${q.mistakes} mistake${q.mistakes > 1 ? 's' : ''}.`), ok ? 'good' : 'warn');
      ui.controls.append(shapeLegend(this.family, q.type));
      later(() => playRun(q.notes), 250);
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('Play it', () => playRun(q.notes), { kbd: 'Space' }),
      );
    },

    revealShape() {
      if (this.locked) return;
      const q = this.q;
      this.locked = true;
      q.notes.forEach(n => {
        if (!q.found.has(n.s + ':' + n.f)) fb.mark(n.s, n.f, { label: q.tones.get(n.pc).label, cls: 'dot-reveal' });
      });
      record(false);
      markWeak(q.key, true);
      feedback(`Here's the rest of ${shapeName(q.sh)}.`, 'bad');
      ui.controls.append(shapeLegend(this.family, q.type));
      playRun(q.notes);
      setActions(
        button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }),
        button('Play it', () => playRun(q.notes), { kbd: 'Space' }),
      );
    },

    // --- Name the degree of a marked note inside a shape
    nextDegree() {
      const q = this.q;
      q.target = pick(q.notes.filter(n => n.semi !== 0));
      q.notes.forEach(n => {
        if (n === q.target) fb.mark(n.s, n.f, { label: '?', cls: 'dot-target' });
        else if (n.semi === 0) fb.mark(n.s, n.f, { label: 'R', cls: 'iv-r' });
        else fb.mark(n.s, n.f, { cls: 'dot-note' });
      });
      fb.scrollToFret(q.target.f);
      ui.prompt.innerHTML = `Which degree of ${shapeTitle(this.family, q.root, q.type)} is this?`;
      ui.sub.textContent = `${shapeName(q.sh, true)} · the roots are marked R. Count up from the nearest root.`;
      ui.pad.hidden = false;
      ui.pad.classList.add('wide');
      const degrees = q.type.iv.filter(i => i !== 0);
      ui.pad.replaceChildren(...degrees.map((semi, i) => {
        const label = T.intervalLabel(q.type, semi);
        return h('button', { type: 'button', dataset: { semi }, onclick: () => this.answer(semi) },
          label, h('small', null, `${i + 1} · ${T.degreeName(label)}`));
      }));
      ui.hint.innerHTML = `<kbd>1</kbd>–<kbd>${degrees.length}</kbd> to answer · <kbd>N</kbd> to skip.`;
      setActions(
        button('Hear it', () => playPos(q.target.s, q.target.f)),
        button('Skip', () => this.next(), { kbd: 'N' }),
      );
    },

    answer(semi) {
      if (this.locked || this.sub !== 'degree') return;
      this.locked = true;
      const q = this.q;
      const ok = semi === q.target.semi;
      const t = q.tones.get(q.target.pc);
      playPos(q.target.s, q.target.f);
      ui.pad.querySelector(`[data-semi="${q.target.semi}"]`).classList.add('is-good');
      if (!ok) ui.pad.querySelector(`[data-semi="${semi}"]`).classList.add('is-bad');
      q.notes.forEach(n => { if (n !== q.target) markTone(n, this.family, q.type, q.tones); });
      fb.mark(q.target.s, q.target.f, {
        label: t.label,
        cls: ok ? toneClass(this.family, q.type, q.target.semi) + ' pop' : 'dot-reveal',
      });
      ui.controls.append(shapeLegend(this.family, q.type));
      const picked = T.intervalLabel(q.type, semi);
      feedback(ok
        ? `✓ That's the ${esc(T.degreeName(t.label))} (${esc(t.name)}).`
        : `It's the ${esc(T.degreeName(t.label))} (${esc(t.name)}), not the ${esc(T.degreeName(picked))}.`, ok ? 'good' : 'bad');
      record(ok, ok ? performance.now() - q.t : undefined);
      markWeak(q.key, !ok);
      setActions(button('Next', () => this.next(), { cls: 'primary', kbd: 'Enter' }));
      later(() => this.next(), ok ? 1300 : 2600);
    },

    supportsMic() { return this.sub === 'play'; },

    onPitch(midi) {
      if (this.sub !== 'play' || this.locked) return;
      const q = this.q;
      const n = q.notes.find(x => x.midi === midi);
      if (n) {
        if (q.found.has(n.s + ':' + n.f)) feedback(`Already got that one (${esc(midiName(midi))}).`, 'info');
        else this.onCell(n.s, n.f, { fromMic: true });
        return;
      }
      const p = nearest(positionsFor(midi), q.notes[0].f + 2);
      if (p) this.onCell(p.s, p.f, { fromMic: true });
    },

    onCell(s, f, opts = {}) {
      const q = this.q;
      if (!opts.fromMic) playPos(s, f);
      else fb.pluck(s);
      if (this.sub !== 'play' || this.locked) return;
      const key = s + ':' + f;
      if (q.found.has(key)) return;
      const n = q.notes.find(x => x.s === s && x.f === f);
      const t = q.tones.get(T.pcAt(s, f));
      const what = esc(shapePlainName(this.family, q.root, q.type));
      if (n) {
        q.found.add(key);
        markTone(n, this.family, q.type, q.tones, { extra: 'pop' });
        feedback('');
        this.updateProgress();
        if (q.found.size === q.notes.length) this.completeShape();
      } else if (t) {
        fb.mark(s, f, { label: t.label, cls: 'dot-ghost' });
        feedback(`${esc(t.name)} is in ${what}, but it sits outside ${shapeName(q.sh)}.`, 'warn');
        later(() => { if (this.q === q && !q.found.has(key)) fb.unmark(s, f); }, 900);
      } else {
        q.mistakes++;
        fb.mark(s, f, { label: dotName(T.pcAt(s, f)), cls: 'dot-bad shake' });
        feedback(`${esc(T.noteName(T.pcAt(s, f), 'both'))} is not in ${what}.`, 'bad');
        this.updateProgress();
        later(() => { if (this.q === q && !q.found.has(key)) fb.unmark(s, f); }, 800);
      }
    },

    onKey(e) {
      if (e.key === ' ' && this.locked && this.sub === 'play') { playRun(this.q.notes); return true; }
      if (this.sub === 'degree' && !this.locked && /^[1-9]$/.test(e.key)) {
        const b = ui.pad.children[+e.key - 1];
        if (b) b.click();
        return true;
      }
      return false;
    },
  };

  // =====================================================================
  // Mode switching
  // =====================================================================

  const MODES = { explore: Explore, notes: Notes, chords: Chords, shapes: Shapes, intervals: Intervals, ear: Ear };
  let current = Explore;
  const tabs = [...document.querySelectorAll('.tab')];

  function setMode(id) {
    SongPlayer.stop();
    Explore.stopProg();
    clearTimers();
    Sound.stopAll();
    current = MODES[id] || Explore;
    store.set('fw.mode', current.id);
    tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.mode === current.id)));
    resetUI();
    fb.setPointerPlay(false);
    $('#learn').hidden = current !== Explore;
    $('#gallery').hidden = true;
    current.enter();
    renderStats();
  }

  tabs.forEach(t => t.addEventListener('click', () => { Sound.init(); setMode(t.dataset.mode); }));

  function refresh() {
    if (current === Explore) Explore.render();
    else current.next();
  }

  // =====================================================================
  // Microphone answers
  // =====================================================================

  const mic = { on: false, heard: null, level: 0, raf: null };
  const micBtn = $('#mic-btn');
  const micBar = $('#mic-status');

  const micUsable = () => !!current.onPitch && (!current.supportsMic || current.supportsMic());

  const detector = Pitch.createNoteDetector(midi => {
    mic.heard = midi;
    renderMic();
    if (micUsable()) current.onPitch(midi);
  }, { isNoisy: () => Metronome.recentClick(0.09) });

  Pitch.subscribe(frame => {
    if (!mic.on) return;
    mic.level = frame.rms;
    if (Sound.isBusy(0.12) || Jam.isRunning()) { detector.reset(); return; } // don't hear our own notes or the band
    detector(frame);
  });

  async function setMic(on) {
    if (on) {
      micBtn.classList.add('is-starting');
      try {
        await Pitch.acquire('answers');
      } catch (err) {
        micBtn.classList.remove('is-starting');
        feedback(esc(err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it from the browser’s address bar and try again.'
          : err.message || 'Could not start the microphone.'), 'bad');
        return;
      }
      micBtn.classList.remove('is-starting');
      mic.on = true;
      mic.heard = null;
      detector.reset();
      Sound.setMaxDuration(1.1); // keep our own notes short so the mic is free again quickly
      meter();
    } else {
      mic.on = false;
      Pitch.release('answers');
      Sound.setMaxDuration(null);
      cancelAnimationFrame(mic.raf);
    }
    renderMic();
  }

  function meter() {
    if (!mic.on) return;
    const pct = Math.max(0, Math.min(100, ((Math.log10(mic.level + 1e-5) + 3) / 2.4) * 100));
    micBar.style.setProperty('--level', pct + '%');
    mic.raf = requestAnimationFrame(meter);
  }

  function renderMic() {
    micBtn.setAttribute('aria-pressed', String(mic.on));
    micBtn.classList.toggle('is-on', mic.on);
    micBar.hidden = !mic.on;
    if (!mic.on) return;
    const heard = mic.heard != null ? ` Heard <b>${esc(midiName(mic.heard))}</b>.` : '';
    let text;
    if (current === Explore) text = 'Listening — play any note to see everywhere it lives.';
    else if (micUsable()) text = 'Listening — play your answer on the guitar.';
    else text = 'The mic is on, but this exercise is answered on screen.';
    micBar.querySelector('.mic-text').innerHTML = text + heard;
    micBar.classList.toggle('is-idle', !micUsable() && current !== Explore);
  }

  micBtn.addEventListener('click', () => { Sound.init(); setMic(!mic.on); });

  // Explore: show where a played note lives.
  Explore.onPitch = function (midi) {
    if (this.state.view === 'free' && SongPlayer.song && SongPlayer.song.kind === 'melody' && !SongPlayer.done()) {
      SongPlayer.check(midi);
      return;
    }
    const list = positionsFor(midi);
    fb.ring(list);
    if (this.state.view === 'interval') {
      const { rootMidi } = this.intervalView();
      const d = midi - rootMidi;
      feedback(`Heard <b>${esc(midiName(midi))}</b> — ` + (d === 0 ? 'the root itself.' : `${esc(describeInterval(d))} the root (${esc(midiName(rootMidi))}).`), 'info');
      return;
    }
    feedback(list.length
      ? `Heard <b>${esc(midiName(midi))}</b> — ${list.length} place${list.length > 1 ? 's' : ''} on this neck.`
      : `Heard <b>${esc(midiName(midi))}</b> — that's off this neck.`, 'info');
  };

  // ---------- Explanations (Explore) ----------

  const learnEl = $('#learn');
  learnEl.addEventListener('toggle', () => store.set('fw.learn.open', learnEl.open));
  learnEl.addEventListener('click', e => {
    const b = e.target.closest('[data-play]');
    if (!b) return;
    Sound.init();
    const [kind, a, id, inv] = b.dataset.play.split(':');
    const F = settings.frets;
    if (kind === 'note') Sound.play(+a, { key: 'learn' });
    else if (kind === 'iv') playIntervalSound(60, 60 + +a); // from middle C
    else if (kind === 'chord') {
      const v = T.findVoicings(+a, T.chordType(id), F)[0];
      if (v) strumShape(v.frets);
    } else if (kind === 'triad') {
      const type = T.chordType(id);
      const sh = T.STRING_SETS.map(set => T.triadShapes(+a, type, +inv, set, F)[0]).find(Boolean);
      if (sh) strumShape(fretsOf(sh.notes));
    } else if (kind === 'scale' || kind === 'arp') {
      const type = kind === 'scale' ? T.scaleType(id) : T.chordType(id);
      const sh = T.positionShapes(+a, type, F)[0];
      if (sh) playRun(sh.placements[0], kind === 'arp' ? 0.22 : 0.17);
    }
  });

  // ---------- Theme (light / dark) ----------

  const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const isDark = () => settings.theme === 'dark' || (settings.theme === 'system' && !!darkQuery && darkQuery.matches);

  function applyTheme() {
    const root = document.documentElement;
    if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
    else delete root.dataset.theme;
    const dark = isDark();
    const btn = $('#theme-btn');
    const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.classList.toggle('is-dark', dark);
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.setAttribute('aria-pressed', String(dark));
  }

  // The top-bar switch flips between light and dark (an explicit choice, saved).
  $('#theme-btn').addEventListener('click', () => {
    settings.theme = isDark() ? 'light' : 'dark';
    saveSettings();
    applyTheme();
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', applyTheme);
  applyTheme();

  // ---------- Tools: metronome & tuner ----------

  $('#metro-btn').addEventListener('click', () => Metronome.toggleVisible());
  Jam.onShowScale = (root, scaleId) => {
    Object.assign(Explore.state, { view: 'scale', scale: { root, type: scaleId, shape: -1 } });
    Explore.save();
    setMode('explore');
  };
  $('#tuner-btn').addEventListener('click', () => Tuner.open({ accidentals: settings.accidentals }));

  // ---------- Keyboard ----------

  document.addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) {
      e.target.blur(); // let our shortcuts win over the focused button
    }
    Sound.init();
    let handled = current.onKey ? current.onKey(e) : false;
    if (!handled && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'm') { Metronome.showTab('metro'); Metronome.toggle(); handled = true; }
      else if (k === 'j') { Metronome.showTab('jam'); Jam.toggle(); handled = true; }
      else if (current !== Explore && k === 'n') { current.next(); handled = true; }
      else if (current !== Explore && e.key === 'Enter' && current.locked) { current.next(); handled = true; }
    }
    if (handled) e.preventDefault();
  });

  // =====================================================================
  // Settings dialog
  // =====================================================================

  const dialog = $('#settings');
  const form = $('#settings-form');
  let settingsDirty = false;

  // Checkbox groups: form field name -> settings key and the options it offers.
  const GROUPS = [
    { name: 'chordType', key: 'chordTypes', el: '#chord-checks', options: T.CHORD_TYPES.map(t => [t.id, t.name]) },
    { name: 'scaleType', key: 'scaleTypes', el: '#scale-checks', options: T.SCALE_TYPES.map(t => [t.id, t.name]) },
    { name: 'pentShape', key: 'pentShapes', el: '#shape-checks', options: [1, 2, 3, 4, 5].map(n => [n, String(n)]), numeric: true },
    { name: 'arpType', key: 'arpTypes', el: '#arp-checks', options: T.ARP_TYPES.map(t => [t.id, t.name]) },
    { name: 'triadType', key: 'triadTypes', el: '#triad-type-checks', options: T.TRIAD_TYPES.map(t => [t.id, t.name]) },
    { name: 'triadSet', key: 'triadSets', el: '#triad-set-checks', options: T.STRING_SETS.map(x => [x.id, `Strings ${x.label}`]) },
    { name: 'triadInv', key: 'triadInversions', el: '#triad-inv-checks', options: T.INVERSIONS.map(i => [i.id, i.name]), numeric: true },
    { name: 'interval', key: 'intervals', el: '#interval-checks', options: T.INTERVALS.map(i => [i.semi, `${i.short} · ${i.name}`]), numeric: true },
    { name: 'earChord', key: 'earChords', el: '#earchord-checks', options: T.ARP_TYPES.map(t => [t.id, t.name]) },
  ];

  const checkbox = (name, value, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name, value }), label);
  GROUPS.forEach(g => $(g.el).append(...g.options.map(([v, label]) => checkbox(g.name, v, label))));
  form.tuning.append(...T.TUNINGS.map(t => h('option', { value: t.id }, t.name)));
  form.tone.append(...Object.entries(Sound.TONES).map(([id, t]) => h('option', { value: id }, t.name)));

  const checkedValues = name => [...form.querySelectorAll(`[name="${name}"]:checked`)].map(i => i.value);
  const setChecked = (name, values) => form.querySelectorAll(`[name="${name}"]`).forEach(i => { i.checked = values.map(String).includes(i.value); });

  function renderStringChecks() {
    $('#string-checks').replaceChildren(...range(6).reverse().map(s =>
      checkbox('string', s, `${T.STRING_ORDINAL[s]} (${T.STRING_NAMES[s]})`)));
  }
  renderStringChecks();

  function fillForm() {
    form.theme.value = settings.theme;
    form.tuning.value = settings.tuning;
    form.frets.value = settings.frets;
    form.accidentals.value = settings.accidentals;
    form.flipped.checked = settings.flipped;
    form.minFret.value = settings.minFret;
    form.maxFret.value = settings.maxFret;
    form.minFret.max = form.maxFret.max = settings.frets;
    form.querySelectorAll('[name="string"]').forEach(i => { i.checked = settings.strings[+i.value]; });
    GROUPS.forEach(g => setChecked(g.name, settings[g.key]));
    form.rootInBass.checked = settings.rootInBass;
    form.pentExtended.checked = settings.pentExtended;
    form.intervalBelow.checked = settings.intervalBelow;
    form.earIntervalStyle.value = settings.earIntervalStyle;
    form.phraseLength.value = settings.phraseLength;
    form.micSensitivity.value = settings.micSensitivity;
    form.sound.checked = settings.sound;
    form.tone.value = settings.tone;
    form.volume.value = settings.volume;
  }

  function applyTuning() {
    T.setTuning(settings.tuning);
    fb.render();
    renderStringChecks();
  }

  form.addEventListener('change', e => {
    const frets = +form.frets.value;
    let min = Math.max(0, Math.min(frets, Math.round(+form.minFret.value || 0)));
    let max = Math.max(0, Math.min(frets, Math.round(+form.maxFret.value || 0)));
    if (min > max) [min, max] = [max, min];
    // Never allow an empty selection.
    const strings = range(6).map(s => form.querySelector(`[name="string"][value="${s}"]`).checked);
    if (!strings.some(Boolean) && e.target.name === 'string') e.target.checked = true;
    GROUPS.forEach(g => { if (e.target.name === g.name && !checkedValues(g.name).length) e.target.checked = true; });

    const tuningChanged = form.tuning.value !== settings.tuning;
    Object.assign(settings, {
      theme: form.theme.value,
      tuning: form.tuning.value,
      frets,
      accidentals: form.accidentals.value,
      flipped: form.flipped.checked,
      minFret: min,
      maxFret: max,
      strings: range(6).map(s => form.querySelector(`[name="string"][value="${s}"]`).checked),
      rootInBass: form.rootInBass.checked,
      pentExtended: form.pentExtended.checked,
      intervalBelow: form.intervalBelow.checked,
      earIntervalStyle: form.earIntervalStyle.value,
      phraseLength: +form.phraseLength.value,
      micSensitivity: +form.micSensitivity.value,
      sound: form.sound.checked,
      tone: form.tone.value,
      volume: +form.volume.value,
    });
    Sound.setTone(settings.tone);
    GROUPS.forEach(g => { settings[g.key] = checkedValues(g.name).map(v => (g.numeric ? Number(v) : v)); });
    saveSettings();
    Sound.setEnabled(settings.sound);
    Sound.setVolume(settings.volume);
    Pitch.setSensitivity(settings.micSensitivity);
    applyTheme();
    if (tuningChanged) applyTuning();
    fb.setOptions({ frets: settings.frets, flipped: settings.flipped });
    fillForm();
    settingsDirty = true;
  });

  form.volume.addEventListener('input', () => Sound.setVolume(+form.volume.value));

  $('#settings-btn').addEventListener('click', () => {
    fillForm();
    settingsDirty = false;
    dialog.showModal();
  });
  dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (settingsDirty) refresh(); });

  $('#reset-progress').addEventListener('click', () => {
    if (!confirm('Reset best streaks and the list of things you tend to miss?')) return;
    Object.keys(weak).forEach(k => delete weak[k]);
    Object.keys(best).forEach(k => delete best[k]);
    Object.keys(session).forEach(k => delete session[k]);
    store.remove('fw.weak');
    store.remove('fw.best');
    renderStats();
  });

  // Unlock audio on the first interaction anywhere.
  document.addEventListener('pointerdown', () => Sound.init(), { once: true });

  setMode(store.get('fw.mode', 'explore'));

})();
