/* Music theory helpers: note names, tunings, chord spelling, voicing search, scales, intervals and triads.
   Strings are indexed 0..5 from the lowest (6th string) to the highest (1st string). */
const Theory = (() => {
  'use strict';

  const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  // Conventional spellings for chord roots (major-ish and minor-ish chords differ).
  const ROOT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const MINOR_ROOT = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
  const IS_NATURAL = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1].map(Boolean);
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

  // ---------- Tunings ----------

  const TUNINGS = [
    { id: 'standard', name: 'Standard (E A D G B E)', notes: [40, 45, 50, 55, 59, 64], names: ['E', 'A', 'D', 'G', 'B', 'e'] },
    { id: 'eb', name: 'E♭ standard (half step down)', notes: [39, 44, 49, 54, 58, 63], names: ['E♭', 'A♭', 'D♭', 'G♭', 'B♭', 'e♭'] },
    { id: 'dstd', name: 'D standard (D G C F A D)', notes: [38, 43, 48, 53, 57, 62], names: ['D', 'G', 'C', 'F', 'A', 'd'] },
    { id: 'cstd', name: 'C standard (C F B♭ E♭ G C)', notes: [36, 41, 46, 51, 55, 60], names: ['C', 'F', 'B♭', 'E♭', 'G', 'c'] },
    { id: 'dropd', name: 'Drop D (D A D G B E)', notes: [38, 45, 50, 55, 59, 64], names: ['D', 'A', 'D', 'G', 'B', 'e'] },
    { id: 'dropc', name: 'Drop C (C G C F A D)', notes: [36, 43, 48, 53, 57, 62], names: ['C', 'G', 'C', 'F', 'A', 'd'] },
    { id: 'dropb', name: 'Drop B (B F♯ B E G♯ C♯)', notes: [35, 42, 47, 52, 56, 61], names: ['B', 'F♯', 'B', 'E', 'G♯', 'c♯'] },
    { id: 'ddropd', name: 'Double drop D (D A D G B D)', notes: [38, 45, 50, 55, 59, 62], names: ['D', 'A', 'D', 'G', 'B', 'd'] },
    { id: 'dadgad', name: 'DADGAD (D A D G A D)', notes: [38, 45, 50, 55, 57, 62], names: ['D', 'A', 'D', 'G', 'A', 'd'] },
    { id: 'opend', name: 'Open D (D A D F♯ A D)', notes: [38, 45, 50, 54, 57, 62], names: ['D', 'A', 'D', 'F♯', 'A', 'd'] },
    { id: 'openg', name: 'Open G (D G D G B D)', notes: [38, 43, 50, 55, 59, 62], names: ['D', 'G', 'D', 'G', 'B', 'd'] },
    { id: 'opene', name: 'Open E (E B E G♯ B E)', notes: [40, 47, 52, 56, 59, 64], names: ['E', 'B', 'E', 'G♯', 'B', 'e'] },
    { id: 'opena', name: 'Open A (E A E A C♯ E)', notes: [40, 45, 52, 57, 61, 64], names: ['E', 'A', 'E', 'A', 'C♯', 'e'] },
    { id: 'openc', name: 'Open C (C G C G C E)', notes: [36, 43, 48, 55, 60, 64], names: ['C', 'G', 'C', 'G', 'C', 'e'] },
  ];

  // These arrays are updated in place by setTuning(), so references held elsewhere stay valid.
  const TUNING = [];        // open-string MIDI notes, lowest string first
  const STRING_NAMES = [];  // short labels for the fretboard
  const STRING_LONG = [];   // names used in sentences ("the low E string", "the D (4th) string")
  const STRING_ORDINAL = ['6th', '5th', '4th', '3rd', '2nd', '1st'];
  let tuning = TUNINGS[0];

  const mod = (n, m) => ((n % m) + m) % m;

  function noteName(pc, pref = 'sharp') {
    pc = mod(pc, 12);
    if (IS_NATURAL[pc]) return SHARP[pc];
    if (pref === 'flat') return FLAT[pc];
    if (pref === 'both') return SHARP[pc] + '/' + FLAT[pc];
    return SHARP[pc];
  }

  /** Short name that fits in a fretboard dot ('both' falls back to sharps). */
  const shortName = (pc, pref) => noteName(pc, pref === 'flat' ? 'flat' : 'sharp');

  function spellings(pc) {
    pc = mod(pc, 12);
    return IS_NATURAL[pc] ? [SHARP[pc]] : [SHARP[pc], FLAT[pc]];
  }

  const isNatural = pc => IS_NATURAL[mod(pc, 12)];
  const midiAt = (s, f) => TUNING[s] + f;
  const pcAt = (s, f) => mod(TUNING[s] + f, 12);
  const octave = midi => Math.floor(midi / 12) - 1;
  const midiName = (midi, pref) => shortName(midi, pref) + octave(midi);

  const tuningById = id => TUNINGS.find(t => t.id === id) || TUNINGS[0];

  function setTuning(id) {
    tuning = tuningById(id);
    TUNING.splice(0, 6, ...tuning.notes);
    STRING_NAMES.splice(0, 6, ...tuning.names);
    const upper = tuning.names.map(n => n[0].toUpperCase() + n.slice(1));
    STRING_LONG.splice(0, 6, ...tuning.names.map((n, s) => {
      const same = upper.map((u, i) => (u === upper[s] ? i : -1)).filter(i => i >= 0);
      if (same.length === 1) return n;
      if (s === same[0]) return 'low ' + upper[s];
      if (s === same[same.length - 1]) return 'high ' + n;
      return `${upper[s]} (${STRING_ORDINAL[s]})`;
    }));
    voicingCache.clear();
    shapeCache.clear();
  }

  // ---------- Chords ----------

  const CHORD_TYPES = [
    { id: 'maj', name: 'major', symbol: '', iv: [0, 4, 7] },
    { id: 'min', name: 'minor', symbol: 'm', iv: [0, 3, 7], minor: true },
    { id: '7', name: 'dominant 7th', symbol: '7', iv: [0, 4, 7, 10], optional: [7] },
    { id: 'maj7', name: 'major 7th', symbol: 'maj7', iv: [0, 4, 7, 11], optional: [7] },
    { id: 'm7', name: 'minor 7th', symbol: 'm7', iv: [0, 3, 7, 10], optional: [7], minor: true },
    { id: 'sus2', name: 'suspended 2nd', symbol: 'sus2', iv: [0, 2, 7] },
    { id: 'sus4', name: 'suspended 4th', symbol: 'sus4', iv: [0, 5, 7] },
    { id: 'dim', name: 'diminished', symbol: 'dim', iv: [0, 3, 6], minor: true },
    { id: 'aug', name: 'augmented', symbol: 'aug', iv: [0, 4, 8] },
    { id: 'm7b5', name: 'half-diminished', symbol: 'm7♭5', iv: [0, 3, 6, 10], minor: true },
    { id: 'dim7', name: 'diminished 7th', symbol: 'dim7', iv: [0, 3, 6, 9], minor: true, labels: { 9: '♭♭7' } },
    { id: '5', name: 'power chord', symbol: '5', iv: [0, 7] },
  ];
  const IV_LABEL = { 0: 'R', 1: '♭2', 2: '2', 3: '♭3', 4: '3', 5: '4', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7' };

  const chordType = id => CHORD_TYPES.find(t => t.id === id) || null;
  const intervalLabel = (type, semi) => (type.labels && type.labels[semi]) || IV_LABEL[semi];
  const chordRootName = (rootPc, type) => (type.minor ? MINOR_ROOT : ROOT)[mod(rootPc, 12)];
  const chordName = (rootPc, type) => chordRootName(rootPc, type) + type.symbol;
  const chordPcs = (rootPc, type) => type.iv.map(i => mod(rootPc + i, 12));
  const requiredPcs = (rootPc, type) =>
    type.iv.filter(i => !(type.optional || []).includes(i)).map(i => mod(rootPc + i, 12));
  const minStringsFor = type => (type.iv.length <= 2 ? 2 : 3);

  const accidental = n => (n === 0 ? '' : n > 0 ? '♯'.repeat(n) : '♭'.repeat(-n));

  /** Map of pitch class -> { name (correctly spelled), label (interval), semi } for a chord. */
  function toneMap(rootPc, type) {
    const rn = chordRootName(rootPc, type);
    const li = LETTERS.indexOf(rn[0]);
    const map = new Map();
    for (const semi of type.iv) {
      const label = intervalLabel(type, semi);
      const degree = parseInt(label.replace(/\D/g, ''), 10) || 1;
      const L = (li + degree - 1) % 7;
      const pc = mod(rootPc + semi, 12);
      const diff = mod(pc - LETTER_PC[L] + 6, 12) - 6;
      map.set(pc, { name: LETTERS[L] + accidental(diff), label, semi });
    }
    return map;
  }

  /** Rough number of fretting fingers a shape needs (allows a barre on the lowest fret). */
  function fingerCount(frets) {
    const fretted = [];
    frets.forEach((f, s) => { if (f != null && f > 0) fretted.push([s, f]); });
    if (fretted.length <= 4) return fretted.length;
    const minF = Math.min(...fretted.map(x => x[1]));
    const atMin = fretted.filter(x => x[1] === minF);
    if (atMin.length < 2) return fretted.length;
    const lowS = Math.min(...atMin.map(x => x[0]));
    for (let s = lowS; s < 6; s++) if (frets[s] === 0) return 99; // open string under a barre
    return 1 + fretted.filter(x => x[1] > minF).length;
  }

  /** Check a user-built shape (array of 6 frets or null) against a chord. */
  function checkShape(frets, rootPc, type, rootInBass = true) {
    const pcs = chordPcs(rootPc, type);
    const notes = [];
    frets.forEach((f, s) => { if (f != null) notes.push({ s, f, pc: pcAt(s, f), midi: midiAt(s, f) }); });
    const wrong = notes.filter(n => !pcs.includes(n.pc));
    const present = new Set(notes.map(n => n.pc));
    const missing = requiredPcs(rootPc, type).filter(p => !present.has(p));
    const bass = notes.reduce((a, n) => (!a || n.midi < a.midi ? n : a), null);
    const fretted = notes.filter(n => n.f > 0).map(n => n.f);
    const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
    const minStrings = minStringsFor(type);
    const bassOk = !rootInBass || !bass || bass.pc === mod(rootPc, 12);
    const ok = notes.length >= minStrings && !wrong.length && !missing.length && bassOk && span <= 4;
    return { ok, notes, wrong, missing, bass, span, minStrings, bassOk };
  }

  const voicingCache = new Map();

  /** Search for playable voicings (root in bass, contiguous strings, <= 4 fingers, 4-fret window).
      `best` is the best shape at each neck position; `all` is every distinct shape (fragments of a
      bigger shape removed), both sorted from the nut upward. */
  function searchVoicings(rootPc, type, maxFret = 15) {
    const key = `${rootPc}|${type.id}|${maxFret}`;
    if (voicingCache.has(key)) return voicingCache.get(key);

    const pcs = new Set(chordPcs(rootPc, type));
    const required = requiredPcs(rootPc, type);
    const minStrings = minStringsFor(type);
    const byPosition = new Map();
    const all = [];
    const seen = new Set();

    const consider = frets => {
      const shapeKey = frets.join(',');
      if (seen.has(shapeKey)) return;
      seen.add(shapeKey);
      const sounding = frets.filter(f => f != null).length;
      if (sounding < minStrings) return;
      // The lowest-sounding note must be the root (in some tunings that isn't the lowest string).
      let bass = null;
      frets.forEach((f, s) => { if (f != null && (bass == null || midiAt(s, f) < bass)) bass = midiAt(s, f); });
      if (mod(bass, 12) !== mod(rootPc, 12)) return;
      const present = new Set();
      frets.forEach((f, s) => { if (f != null) present.add(pcAt(s, f)); });
      if (!required.every(p => present.has(p))) return;
      const fingers = fingerCount(frets);
      if (fingers > 4) return;
      const fretted = frets.filter(f => f != null && f > 0);
      const hasOpen = frets.some(f => f === 0);
      const minF = fretted.length ? Math.min(...fretted) : 0;
      const lastSounding = frets.reduce((a, f, s) => (f != null ? s : a), -1);
      const mutedTop = 5 - lastSounding;

      let score = type.iv.length === 2 ? 12 - Math.abs(sounding - 3) * 3 : sounding * 4;
      const span = fretted.length ? Math.max(...fretted) - minF : 0;
      const mutedBass = frets.findIndex(f => f != null);
      score -= mutedTop * 3 + mutedBass * 0.5 + fingers * 1.2 + span * 0.6 + minF * 0.15;
      if (hasOpen) score += 1;
      if (present.size < pcs.size) score -= 1;

      const pos = hasOpen ? 0 : minF;
      const shape = { frets, score, position: pos, sounding, fingers };
      all.push(shape);
      const prev = byPosition.get(pos);
      if (!prev || score > prev.score) byPosition.set(pos, shape);
    };

    for (let w = 1; w <= Math.max(1, maxFret - 3); w++) {
      const hi = Math.min(maxFret, w + 3);
      const options = [];
      for (let s = 0; s < 6; s++) {
        const o = [null];
        if (w === 1 && pcs.has(pcAt(s, 0))) o.push(0);
        for (let f = w; f <= hi; f++) if (pcs.has(pcAt(s, f))) o.push(f);
        options.push(o);
      }
      const cur = new Array(6).fill(null);
      (function rec(s, started, ended) {
        if (s === 6) { consider(cur.slice()); return; }
        for (const f of options[s]) {
          if (f === null) {
            cur[s] = null;
            rec(s + 1, started, started);
          } else {
            if (ended) continue;
            cur[s] = f;
            rec(s + 1, true, false);
          }
        }
        cur[s] = null;
      })(0, false, false);
    }

    const best = [...byPosition.values()].sort((a, b) => a.position - b.position);
    const covers = (big, small) => small.frets.every((f, i) => f == null || big.frets[i] === f);
    const every = all
      .filter(v => !all.some(o => o.sounding > v.sounding && covers(o, v)))
      .sort((a, b) => a.position - b.position || b.score - a.score);
    const result = { best, all: every };
    voicingCache.set(key, result);
    return result;
  }

  const findVoicings = (rootPc, type, maxFret) => searchVoicings(rootPc, type, maxFret).best;
  const allVoicings = (rootPc, type, maxFret) => searchVoicings(rootPc, type, maxFret).all;

  // ---------- Scales & positional shapes ----------

  const SCALE_TYPES = [
    { id: 'minpent', name: 'minor pentatonic', iv: [0, 3, 5, 7, 10], minor: true, relative: ['majpent', 3] },
    { id: 'majpent', name: 'major pentatonic', iv: [0, 2, 4, 7, 9], relative: ['minpent', 9] },
    // The blues scale is the minor pentatonic plus the ♭5 "blue note"; its boxes follow the pentatonic ones.
    { id: 'blues', name: 'blues', iv: [0, 3, 5, 6, 7, 10], minor: true, shapeStarts: [0, 3, 5, 7, 10], blue: 6 },
  ];
  // Chord types that make sense as arpeggios (a two-note power chord doesn't).
  const ARP_TYPES = CHORD_TYPES.filter(t => t.iv.length >= 3);

  const scaleType = id => SCALE_TYPES.find(t => t.id === id) || null;
  const scaleName = (rootPc, type) => chordRootName(rootPc, type) + ' ' + type.name;

  /** One positional shape: start on a tone on the lowest string, then walk up the tones in pitch
      order, moving to the next string whenever the next tone would sit more than `span` frets
      above the start. In standard tuning this yields the classic two-notes-per-string pentatonic
      boxes. Wide string gaps (open tunings) get a small stretch; tones no finger can reach are skipped. */
  function shapeAt(rootPc, type, startFret, span = 3) {
    const pcs = new Set(type.iv.map(i => mod(rootPc + i, 12)));
    const limit = startFret + span;
    const notes = [];
    const advance = m => { do { m++; } while (!pcs.has(mod(m, 12))); return m; };
    let s = 0;
    let midi = TUNING[0] + startFret;
    while (s < 6) {
      const f = midi - TUNING[s];
      if (f > limit) {
        if (s === 5) break;
        if (midi - TUNING[s + 1] >= startFret - 1) { s++; continue; }
        if (f > limit + 2) { midi = advance(midi); continue; }
      }
      notes.push({ s, f, midi, pc: mod(midi, 12), semi: mod(midi - rootPc, 12) });
      midi = advance(midi);
    }
    return notes;
  }

  const shapeCache = new Map();

  /** All positional shapes for a scale/arpeggio, one per starting tone (shape 1 starts on the root).
      Each shape lists every placement that fits on a neck of `maxFret` frets. */
  function positionShapes(rootPc, type, maxFret = 15) {
    const key = `${rootPc}|${type.id}|${maxFret}`;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const starts = type.shapeStarts || type.iv;
    const shapes = starts.map((iv, index) => {
      const base = mod(rootPc + iv - TUNING[0], 12); // lowest fret of this tone on the low E string
      const placements = [];
      for (let f = base; f <= maxFret; f += 12) {
        const notes = shapeAt(rootPc, type, f);
        if (notes.every(n => n.f >= 0 && n.f <= maxFret)) placements.push(notes);
      }
      if (!placements.length) { // short neck: keep whatever part of the lowest placement fits
        const notes = shapeAt(rootPc, type, base).filter(n => n.f >= 0 && n.f <= maxFret);
        if (notes.length) placements.push(notes);
      }
      return { index, startIv: iv, placements };
    });
    const list = shapes.filter(sh => sh.placements.length);
    shapeCache.set(key, list);
    return list;
  }

  /** Extended ("diagonal") pentatonic shapes: walk up the scale in pitch order, alternating 2 and 3
      notes per string, so the hand climbs the neck through several boxes. Only patterns where no
      string needs more than a 4-fret reach are kept — in standard tuning that's the 2-3-2-3-2-3 shape
      from the ♭7 (A minor: 3-5 | 3-5-7 | 5-7 | 5-7-9 | 8-10 | 8-10-12) and the 3-2-3-2-3-2 shape from the ♭3. */
  function extendedShapes(rootPc, type, maxFret = 15) {
    if (type.iv.length !== 5) return [];
    const key = `ext|${rootPc}|${type.id}|${maxFret}`;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const pcs = new Set(type.iv.map(i => mod(rootPc + i, 12)));
    const walk = (startFret, counts) => {
      let midi = TUNING[0] + startFret;
      const notes = [];
      counts.forEach((count, s) => {
        for (let k = 0; k < count; k++) {
          notes.push({ s, f: midi - TUNING[s], midi, pc: mod(midi, 12), semi: mod(midi - rootPc, 12) });
          do { midi++; } while (!pcs.has(mod(midi, 12)));
        }
      });
      return notes;
    };
    const shapes = [];
    for (const counts of [[2, 3, 2, 3, 2, 3], [3, 2, 3, 2, 3, 2]]) {
      for (const iv of type.iv) {
        const base = mod(rootPc + iv - TUNING[0], 12);
        const sample = walk(base, counts);
        const reach = Math.max(...counts.map((_, s) => {
          const fs = sample.filter(n => n.s === s).map(n => n.f);
          return Math.max(...fs) - Math.min(...fs);
        }));
        if (reach > 4) continue;
        const placements = [];
        for (let f = base; f <= maxFret; f += 12) {
          const notes = walk(f, counts);
          if (notes.every(n => n.f >= 0 && n.f <= maxFret)) placements.push(notes);
        }
        let truncated = false;
        if (!placements.length) { // the top runs past the end of a short neck: keep the part that fits
          const notes = walk(base, counts).filter(n => n.f >= 0 && n.f <= maxFret);
          if (notes.length >= 8) { placements.push(notes); truncated = true; }
        }
        if (placements.length) shapes.push({ startIv: iv, counts, placements, extended: true, truncated });
      }
    }
    shapes.sort((a, b) => Math.min(...a.placements[0].map(n => n.f)) - Math.min(...b.placements[0].map(n => n.f)));
    shapes.forEach((sh, i) => { sh.index = i; });
    shapeCache.set(key, shapes);
    return shapes;
  }

  const fretSpan = notes => {
    const fs = notes.map(n => n.f);
    return [Math.min(...fs), Math.max(...fs)];
  };

  const DEGREE_NAMES = {
    R: 'root', '♭2': 'minor 2nd', 2: '2nd', '♭3': 'minor 3rd', 3: 'major 3rd', 4: '4th', '♭5': 'flat 5th',
    5: '5th', '♯5': 'sharp 5th', 6: '6th', '♭7': 'minor 7th', 7: 'major 7th', '♭♭7': 'diminished 7th',
  };
  const degreeName = label => DEGREE_NAMES[label] || label;

  // ---------- Intervals ----------

  const INTERVALS = [
    { semi: 1, short: 'm2', name: 'minor 2nd' },
    { semi: 2, short: 'M2', name: 'major 2nd' },
    { semi: 3, short: 'm3', name: 'minor 3rd' },
    { semi: 4, short: 'M3', name: 'major 3rd' },
    { semi: 5, short: 'P4', name: 'perfect 4th' },
    { semi: 6, short: 'TT', name: 'tritone' },
    { semi: 7, short: 'P5', name: 'perfect 5th' },
    { semi: 8, short: 'm6', name: 'minor 6th' },
    { semi: 9, short: 'M6', name: 'major 6th' },
    { semi: 10, short: 'm7', name: 'minor 7th' },
    { semi: 11, short: 'M7', name: 'major 7th' },
    { semi: 12, short: 'P8', name: 'octave' },
  ];
  const interval = semi => INTERVALS.find(i => i.semi === semi) || null;

  // ---------- Triads on string sets ----------

  const TRIAD_TYPES = ['maj', 'min', 'dim', 'aug'].map(chordType);
  const INVERSIONS = [
    { id: 0, name: 'root position', short: 'root pos.', order: [0, 1, 2] }, // R 3 5 from the bottom
    { id: 1, name: '1st inversion', short: '1st inv.', order: [1, 2, 0] },  // 3 5 R
    { id: 2, name: '2nd inversion', short: '2nd inv.', order: [2, 0, 1] },  // 5 R 3
  ];
  // Three adjacent strings, highest set first. Labels use guitar string numbers.
  const STRING_SETS = [[3, 4, 5], [2, 3, 4], [1, 2, 3], [0, 1, 2]].map(set => ({
    id: set.join(''),
    strings: set,
    label: set.map(s => 6 - s).join('–'),
  }));
  const stringSet = id => STRING_SETS.find(x => x.id === id) || STRING_SETS[0];

  /** Close-voiced triads (one note per string, all within an octave) on a string set. */
  function triadShapes(rootPc, type, inversion, set, maxFret = 15) {
    const order = INVERSIONS[inversion].order.map(i => type.iv[i]);
    const [a, b, c] = set.strings;
    const shapes = [];
    for (let f0 = 0; f0 <= maxFret; f0++) {
      if (pcAt(a, f0) !== mod(rootPc + order[0], 12)) continue;
      let midi = midiAt(a, f0);
      const notes = [{ s: a, f: f0, midi, semi: order[0], pc: mod(midi, 12) }];
      for (const [k, s] of [[1, b], [2, c]]) {
        const pc = mod(rootPc + order[k], 12);
        do { midi++; } while (mod(midi, 12) !== pc);
        notes.push({ s, f: midi - TUNING[s], midi, semi: order[k], pc });
      }
      if (notes.some(n => n.f < 0 || n.f > maxFret)) continue;
      const fretted = notes.filter(n => n.f > 0).map(n => n.f);
      const lo = fretted.length ? Math.min(...fretted) : 0;
      if (fretted.length && Math.max(...fretted) - lo > 4) continue;
      shapes.push({ notes, inversion, set, position: lo });
    }
    return shapes;
  }

  /** Check three notes ({ s, f, midi, pc }) against a triad in a given inversion. */
  function checkTriad(notes, rootPc, type, inversion) {
    const pcs = new Set(chordPcs(rootPc, type));
    const sorted = [...notes].sort((x, y) => x.midi - y.midi);
    const wrong = sorted.filter(n => !pcs.has(n.pc));
    const present = new Set(sorted.map(n => n.pc));
    const missing = [...pcs].filter(p => !present.has(p));
    const close = sorted[sorted.length - 1].midi - sorted[0].midi < 12;
    const played = !wrong.length && !missing.length && close
      ? INVERSIONS.findIndex(inv => inv.order.every((i, k) => mod(rootPc + type.iv[i], 12) === sorted[k].pc))
      : -1;
    return { ok: played === inversion, wrong, missing, close, played };
  }

  const shapeString = frets => {
    const parts = frets.map(f => (f == null ? 'x' : String(f)));
    return parts.some(p => p.length > 1) ? parts.join('-') : parts.join('');
  };

  setTuning('standard');

  return {
    TUNINGS, TUNING, STRING_NAMES, STRING_LONG, STRING_ORDINAL, CHORD_TYPES,
    setTuning, tuningById, currentTuning: () => tuning,
    INTERVALS, interval, TRIAD_TYPES, INVERSIONS, STRING_SETS, stringSet, triadShapes, checkTriad,
    mod, noteName, shortName, spellings, isNatural, midiAt, pcAt, octave, midiName,
    chordType, chordName, chordRootName, chordPcs, toneMap, checkShape, findVoicings, allVoicings, fingerCount, shapeString,
    SCALE_TYPES, ARP_TYPES, scaleType, scaleName, positionShapes, extendedShapes, fretSpan, intervalLabel, degreeName,
  };
})();
