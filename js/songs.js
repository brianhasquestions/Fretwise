/* Songs for Free play: public-domain tunes, traditional forms and riffs, and original studies.
   Melodies: space-separated notes like "E4" or "F#4:1.5" (duration in beats, default 1); "|" marks bars and is ignored.
     `swing: true` plays pairs of eighth notes long–short, the way blues and jazz are phrased.
   Chord songs: chord names like "Am:6" (beats per chord). `style` is 'strum' (one strum per beat),
     'arp' (picked, up and down the shape) or 'shuffle' (the root + 5th / root + 6th blues shuffle, swung).
   `pd: false` marks original material (not a public-domain song). `tag` groups songs in the menu. */
const Songs = (() => {
  'use strict';

  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUALITY = { '': 'maj', m: 'min', 7: '7', maj7: 'maj7', m7: 'm7' };

  function toMidi(tok) {
    const m = tok.match(/^([A-G])([#b]?)(-?\d)$/);
    if (!m) throw new Error('Bad note: ' + tok);
    return (+m[3] + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  const tokens = str => str.split(/\s+/).filter(t => t && t !== '|');

  /** The boogie-woogie walking bass: 1-3-5-6-♭7-6-5-3 in swung eighths, one bar per root. */
  const boogie = roots => roots.flatMap(r => [0, 4, 7, 9, 10, 9, 7, 4].map(i => ({ midi: toMidi(r) + i, beats: 0.5 })));

  const melody = str => tokens(str).map(t => {
    const [n, d] = t.split(':');
    return { midi: toMidi(n), beats: d ? +d : 1 };
  });

  const chords = str => tokens(str).map(t => {
    const [name, d] = t.split(':');
    const m = name.match(/^([A-G])([#b]?)(.*)$/);
    const root = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    return { name, root, type: QUALITY[m[3]], beats: d ? +d : 4 };
  });

  const LIST = [
    {
      id: 'ode', title: 'Ode to Joy', credit: 'Beethoven, 1824', kind: 'melody', bpm: 110,
      notes: melody(`E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 |
                     E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2`),
    },
    {
      id: 'twinkle', title: 'Twinkle, Twinkle, Little Star', credit: 'Traditional', kind: 'melody', bpm: 100,
      notes: melody(`C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 |
                     G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 |
                     C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2`),
    },
    {
      id: 'mary', title: 'Mary Had a Little Lamb', credit: 'Traditional', kind: 'melody', bpm: 110,
      notes: melody(`E4 D4 C4 D4 | E4 E4 E4:2 | D4 D4 D4:2 | E4 G4 G4:2 |
                     E4 D4 C4 D4 | E4 E4 E4 E4 | D4 D4 E4 D4 | C4:4`),
    },
    {
      id: 'frere', title: 'Frère Jacques', credit: 'Traditional', kind: 'melody', bpm: 110,
      notes: melody(`C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 |
                     G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 | G4:0.5 A4:0.5 G4:0.5 F4:0.5 E4 C4 |
                     C4 G3 C4:2 | C4 G3 C4:2`),
    },
    {
      id: 'jingle', title: 'Jingle Bells (chorus)', credit: 'James Lord Pierpont, 1857', kind: 'melody', bpm: 120,
      notes: melody(`E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 |
                     F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 |
                     E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 |
                     F4 F4 F4 F4 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4`),
    },
    {
      id: 'birthday', title: 'Happy Birthday', credit: 'Mildred & Patty Hill, 1893', kind: 'melody', bpm: 100,
      notes: melody(`D4:0.75 D4:0.25 E4 D4 | G4 F#4:2 | D4:0.75 D4:0.25 E4 D4 | A4 G4:2 |
                     D4:0.75 D4:0.25 D5 B4 | G4 F#4 E4 | C5:0.75 C5:0.25 B4 G4 | A4 G4:2`),
    },
    {
      id: 'greensleeves', title: 'Greensleeves', credit: 'Traditional English, 16th century', kind: 'melody', bpm: 130,
      notes: melody(`A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 | G3:1.5 A3:0.5 B3 | C4:2 A3 |
                     A3:1.5 G#3:0.5 A3 | B3:2 G#3 | E3:2 A3 | C4:2 D4 | E4:1.5 F4:0.5 E4 | D4:2 B3 |
                     G3:1.5 A3:0.5 B3 | C4:1.5 B3:0.5 A3 | G#3:1.5 F#3:0.5 G#3 | A3:3`),
    },
    {
      id: 'elise', title: 'Für Elise (opening)', credit: 'Beethoven, 1810', kind: 'melody', bpm: 72,
      notes: melody(`E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 |
                     C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 G#4:0.5 B4:0.5 C5:1.5 |
                     E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 |
                     C4:0.5 E4:0.5 A4:0.5 B4:1.5 | E4:0.5 C5:0.5 B4:0.5 A4:3`),
    },
    {
      id: 'rising', title: 'House of the Rising Sun', credit: 'Traditional American', kind: 'chords', bpm: 170, style: 'arp',
      chords: chords(`Am:6 C:6 D:6 F:6 | Am:6 C:6 E:6 E:6 | Am:6 C:6 D:6 F:6 | Am:6 E:6 Am:6 E:6`),
    },
    // ---- Blues ----
    {
      id: 'blues', tag: 'Blues', title: '12-bar shuffle in A', credit: 'Traditional blues form', kind: 'chords', bpm: 100, style: 'shuffle',
      chords: chords(`A7 A7 A7 A7 | D7 D7 A7 A7 | E7 D7 A7 E7`),
    },
    {
      id: 'quickchange', tag: 'Blues', title: '12-bar shuffle in E (quick change)', credit: 'Traditional blues form', kind: 'chords', bpm: 112, style: 'shuffle',
      chords: chords(`E7 A7 E7 E7 | A7 A7 E7 E7 | B7 A7 E7 B7`),
    },
    {
      id: 'slowblues', tag: 'Blues', title: 'Slow blues in G (12/8)', credit: 'Traditional blues form', kind: 'chords', bpm: 165, style: 'arp',
      chords: chords(`G7:12 C7:12 G7:12 G7:12 | C7:12 C7:12 G7:12 G7:12 | D7:12 C7:12 G7:12 D7:12`),
    },
    {
      id: 'minorblues', tag: 'Blues', title: 'Minor blues in A', credit: 'Traditional blues form', kind: 'chords', bpm: 84, style: 'strum',
      chords: chords(`Am7 Am7 Am7 Am7 | Dm7 Dm7 Am7 Am7 | F7 E7 Am7 E7`),
    },
    {
      id: 'eightbar', tag: 'Blues', title: '8-bar blues in A', credit: 'Traditional blues form', kind: 'chords', bpm: 104, style: 'shuffle',
      chords: chords(`A7 E7 D7 D7 | A7 E7 A7 E7`),
    },
    {
      id: 'jazzblues', tag: 'Blues', title: 'Jazz blues in F', credit: 'Traditional jazz form', kind: 'chords', bpm: 120, style: 'strum',
      chords: chords(`F7 Bb7 F7 F7 | Bb7 Bb7 F7 D7 | Gm7 C7 F7 C7`),
    },
    {
      id: 'boogie', tag: 'Blues', title: 'Boogie-woogie bass line in A', credit: 'Traditional boogie pattern', kind: 'melody', bpm: 120, swing: true,
      notes: boogie(['A2', 'A2', 'A2', 'A2', 'D3', 'D3', 'A2', 'A2', 'E2', 'D3', 'A2', 'E2']),
    },
    {
      id: 'bluesstudy', tag: 'Blues', title: 'Twelve-bar blues melody in A', credit: 'Original study written for this app', pd: false,
      kind: 'melody', bpm: 92, swing: true,
      notes: melody(`A4:0.5 C5:0.5 D5:0.5 D#5:0.5 E5:2 | D5:0.5 C5:0.5 A4:3 |
                     A4:0.5 C5:0.5 D5:0.5 D#5:0.5 E5:2 | G4:0.5 A4:0.5 C5 A4 G4 |
                     D5:0.5 C5:0.5 A4:0.5 C5:0.5 D5:2 | C5:0.5 A4:0.5 F#4:3 |
                     A4:0.5 C5:0.5 D5:0.5 D#5:0.5 E5:2 | C5:0.5 A4:0.5 A4:3 |
                     G4:0.5 G#4:0.5 B4:0.5 D5:0.5 E5:2 | D5:0.5 C5:0.5 A4:0.5 F#4:0.5 A4:2 |
                     G4:0.5 A4:0.5 C5:0.5 C#5:0.5 A4:2 | E4:0.5 G#4:0.5 B4:0.5 D5:0.5 E5:2 | A4:4`),
    },
    {
      id: 'canon', title: 'Canon in D (progression)', credit: 'Pachelbel, c. 1680', kind: 'chords', bpm: 90, style: 'arp',
      chords: chords(`D:4 A:4 Bm:4 F#m:4 | G:4 D:4 G:4 A:4 | D:4 A:4 Bm:4 F#m:4 | G:4 D:4 G:4 A:4`),
    },
    {
      id: 'axis', title: 'I–V–vi–IV in G (the “four chords”)', credit: 'Common progression', kind: 'chords', bpm: 96, style: 'strum',
      chords: chords(`G D Em C | G D Em C`),
    },
  ];

  return { LIST, byId: id => LIST.find(s => s.id === id) || null };
})();
