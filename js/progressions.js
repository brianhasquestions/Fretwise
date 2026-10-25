/* Chord progressions for Explore → Chords → Progressions, voiced with movable shapes (no open
   strings) chosen so the hand moves as little as possible from chord to chord. */
const Progressions = (() => {
  'use strict';

  // chords: [semitones above the key, chord type]; key: default key (pitch class); beats per chord.
  const LIST = [
    { id: 'pop', name: 'I – V – vi – IV', key: 0, chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']],
      feel: 'The “four chords” behind countless pop songs — bright and singable.' },
    { id: 'popminor', name: 'vi – IV – I – V', key: 0, chords: [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']],
      feel: 'The same four chords, starting on the minor — more emotional and anthemic.' },
    { id: 'doowop', name: 'I – vi – IV – V', key: 0, chords: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
      feel: 'The 1950s doo-wop progression — sweet and nostalgic.' },
    { id: 'canon', name: 'I – V – vi – iii – IV – I – IV – V', key: 2, beats: 2,
      chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [4, 'min'], [5, 'maj'], [0, 'maj'], [5, 'maj'], [7, 'maj']],
      feel: 'Pachelbel’s Canon — the ancestor of a thousand pop songs. Listen to the bass walk down.' },
    { id: 'creep', name: 'I – III – IV – iv', key: 7, chords: [[0, 'maj'], [4, 'maj'], [5, 'maj'], [5, 'min']],
      feel: 'The major IV turning minor is a “borrowed” chord — bittersweet and cinematic.' },
    { id: 'twofive', name: 'ii7 – V7 – Imaj7', key: 0, chords: [[2, 'm7'], [7, '7'], [0, 'maj7'], [0, 'maj7']],
      feel: 'The backbone of jazz: the V7 builds tension that the Imaj7 releases.' },
    { id: 'turnaround', name: 'Imaj7 – vi7 – ii7 – V7', key: 0, chords: [[0, 'maj7'], [9, 'm7'], [2, 'm7'], [7, '7']],
      feel: 'The classic jazz-standard turnaround — it loops back to the start by itself.' },
    { id: 'circle', name: 'vi7 – ii7 – V7 – Imaj7', key: 0, chords: [[9, 'm7'], [2, 'm7'], [7, '7'], [0, 'maj7']],
      feel: 'Down the circle of fifths: every chord pulls toward the next.' },
    { id: 'neosoul', name: 'Imaj7 – iii7 – vi7 – IVmaj7', key: 5, chords: [[0, 'maj7'], [4, 'm7'], [9, 'm7'], [5, 'maj7']],
      feel: 'Lush and smooth — neo-soul and R&B. Let the chords ring.' },
    { id: 'royal', name: 'IVmaj7 – V7 – iii7 – vi', key: 0, chords: [[5, 'maj7'], [7, '7'], [4, 'm7'], [9, 'min']],
      feel: 'The “royal road” of J-pop and anime themes — yearning and bittersweet.' },
    { id: 'backdoor', name: 'iv7 – ♭VII7 – Imaj7', key: 0, chords: [[5, 'm7'], [10, '7'], [0, 'maj7'], [0, 'maj7']],
      feel: 'The “backdoor” resolution — a soulful, sideways way home.' },
    { id: 'minorrock', name: 'i – ♭VII – ♭VI – ♭VII', key: 9, minor: true, chords: [[0, 'min'], [10, 'maj'], [8, 'maj'], [10, 'maj']],
      feel: 'Epic minor-key rock — the shapes climb and fall around the root.' },
    { id: 'andalusian', name: 'i – ♭VII – ♭VI – V', key: 9, minor: true, chords: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'maj']],
      feel: 'Flamenco and surf drama: a stepwise descent, with a major V pulling home.' },
    { id: 'minorfour', name: 'i – iv – ♭VII – ♭III', key: 4, minor: true, chords: [[0, 'min'], [5, 'min'], [10, 'maj'], [3, 'maj']],
      feel: 'Dark, then hopeful — it climbs from minor to the relative major.' },
    { id: 'minortwofive', name: 'iiø7 – V7 – i7', key: 9, minor: true, chords: [[2, 'm7b5'], [7, '7'], [0, 'm7'], [0, 'm7']],
      feel: 'The minor ii–V–i: the half-diminished ii makes it darker and more dramatic.' },
    { id: 'dorian', name: 'i7 – IV7', key: 2, minor: true, chords: [[0, 'm7'], [5, '7']],
      feel: 'A two-chord Dorian vamp — funk, soul and Santana territory.' },
  ];

  const NUMERAL = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♯IV', 'V', '♭VI', 'VI', '♭VII', 'VII'];
  const LOWER = new Set(['min', 'm7', 'm7b5', 'dim', 'dim7']);
  const SUFFIX = { maj: '', min: '', 7: '7', maj7: 'maj7', m7: '7', m7b5: 'ø7', dim: '°', dim7: '°7', aug: '+', sus2: 'sus2', sus4: 'sus4', 5: '5' };

  /** Roman numeral for a chord: ii7, V7, ♭VII, iiø7… */
  function numeral(deg, typeId) {
    const n = NUMERAL[deg % 12];
    return (LOWER.has(typeId) ? n.toLowerCase() : n) + (SUFFIX[typeId] ?? '');
  }

  const STYLES = { barre: 'Barre chords', four: '4-string shapes', triad: 'Triads (top strings)' };
  const AREAS = { auto: 'Smoothest', low: 'Low (frets 1–5)', mid: 'Middle (frets 5–9)', high: 'High (frets 8–12)' };

  const fretsOf = notes => {
    const frets = new Array(6).fill(null);
    notes.forEach(n => { frets[n.s] = n.f; });
    return frets;
  };

  const shape = (frets, penalty = 0) => {
    const fretted = frets.filter(f => f != null && f > 0);
    return {
      frets,
      penalty,
      center: fretted.reduce((a, b) => a + b, 0) / Math.max(1, fretted.length),
      position: fretted.length ? Math.min(...fretted) : 0,
      low: frets.findIndex(f => f != null),
    };
  };

  /** Close shapes on a set of adjacent strings (one note each, no open strings), any inversion:
      every chord tone must be present, and the shape must fit in four frets. */
  function upperShapes(root, type, strings, F) {
    const T = Theory;
    const pcs = new Set(T.chordPcs(root, type));
    const out = [];
    const seen = new Set();
    for (let w = 1; w <= F - 3; w++) {
      const options = strings.map(s => {
        const o = [];
        for (let f = w; f <= w + 3; f++) if (pcs.has(T.pcAt(s, f))) o.push(f);
        return o;
      });
      const pick = new Array(strings.length);
      (function rec(i) {
        if (i === strings.length) {
          const present = new Set(strings.map((s, k) => T.pcAt(s, pick[k])));
          if (present.size !== pcs.size) return;
          const frets = new Array(6).fill(null);
          strings.forEach((s, k) => { frets[s] = pick[k]; });
          const key = frets.join(',');
          if (seen.has(key)) return;
          seen.add(key);
          const span = Math.max(...pick) - Math.min(...pick);
          const rootInBass = T.pcAt(strings[0], pick[0]) === root;
          out.push(shape(frets, span * 0.3 + (rootInBass ? 0 : 0.4)));
          return;
        }
        for (const f of options[i]) { pick[i] = f; rec(i + 1); }
      })(0);
    }
    return out;
  }

  /** Movable (no open string) shapes for one chord in the chosen style. */
  function candidates(root, type, style, maxFret) {
    const T = Theory;
    const F = Math.min(maxFret, 15);
    if (style === 'triad') {
      const triad = { maj: 'maj', min: 'min', dim: 'dim', aug: 'aug' }[type.id];
      if (triad) {
        const out = [];
        for (const set of [T.stringSet('345'), T.stringSet('234')]) {
          for (const inv of [0, 1, 2]) {
            for (const sh of T.triadShapes(root, T.chordType(triad), inv, set, F)) {
              if (sh.notes.every(n => n.f > 0)) out.push(shape(fretsOf(sh.notes), inv ? 0.2 : 0));
            }
          }
        }
        if (out.length) return out;
      }
      // Four-note chords (7ths) need four strings: use the top four.
      const top = upperShapes(root, type, [2, 3, 4, 5], F);
      if (top.length) return top;
    }
    if (style === 'four' || style === 'triad') {
      const four = [...upperShapes(root, type, [2, 3, 4, 5], F), ...upperShapes(root, type, [1, 2, 3, 4], F)];
      if (four.length) return four;
    }
    // Barre style: the full-chord search, without open strings, weighted toward the most practical shapes.
    const all = T.allVoicings(root, type, F).filter(v => v.frets.every(f => f == null || f > 0));
    const sounding = v => v.frets.filter(f => f != null).length;
    let list = all.filter(v => sounding(v) >= 5);
    if (!list.length) list = all.filter(v => sounding(v) >= 4);
    if (!list.length) list = T.findVoicings(root, type, F); // last resort (rare in odd tunings)
    const best = Math.max(...list.map(v => v.score ?? 0));
    const stretch = frets => { const f = frets.filter(x => x != null); return Math.max(...f) - Math.min(...f); };
    // Prefer the standard barre shapes over four-fret stretches.
    return list.map(v => shape(v.frets, (best - (v.score ?? 0)) * 0.35 + (stretch(v.frets) >= 3 ? 1.2 : 0)));
  }

  /** Voice a progression: the path of shapes with the least total hand movement (Viterbi search). */
  function voice(prog, key, style, area, maxFret) {
    const T = Theory;
    const chords = prog.chords.map(([deg, typeId]) => {
      const type = T.chordType(typeId);
      const root = (key + deg) % 12;
      return { deg, root, type, name: T.chordName(root, type), numeral: numeral(deg, typeId), cands: candidates(root, type, style, maxFret) };
    });
    const target = { low: 3.5, mid: 6.5, high: 9.5 }[area];
    const stay = c => c.penalty + (target == null ? c.center * 0.12 : Math.abs(c.center - target) * 0.8);
    const move = (a, b) => Math.abs(a.center - b.center) + (a.low === b.low ? 0 : 0.6);

    const steps = [];
    chords.forEach((ch, i) => {
      steps.push(ch.cands.map(c => {
        if (!i) return { cost: stay(c), back: -1 };
        let best = Infinity;
        let arg = 0;
        steps[i - 1].forEach((p, j) => {
          const cost = p.cost + move(chords[i - 1].cands[j], c);
          if (cost < best) { best = cost; arg = j; }
        });
        return { cost: best + stay(c), back: arg };
      }));
    });
    const last = steps[steps.length - 1];
    let j = last.length ? last.reduce((a, x, k) => (x.cost < last[a].cost ? k : a), 0) : -1;
    for (let i = chords.length - 1; i >= 0; i--) {
      chords[i].voicing = j >= 0 ? chords[i].cands[j] : null;
      j = j >= 0 ? steps[i][j].back : -1;
    }
    return chords.map(({ cands, ...c }) => c);
  }

  return { LIST, STYLES, AREAS, byId: id => LIST.find(p => p.id === id) || LIST[0], numeral, voice };
})();
