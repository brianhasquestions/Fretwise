/* Explanations shown under the fretboard in Explore, one per view.
   Buttons carry a data-play attribute that the app turns into sound:
     note:<midi> · iv:<semitones> · chord:<rootPc>:<typeId> · triad:<rootPc>:<typeId>:<inversion>
     scale:<rootPc>:<scaleId> · arp:<rootPc>:<typeId>                                              */
const Learn = (() => {
  'use strict';

  const play = (spec, label) => `<button type="button" class="play-chip" data-play="${spec}">▶ ${label}</button>`;

  const INTERVAL_SONGS = {
    1: 'Jaws theme', 2: 'Happy Birthday', 3: 'Smoke on the Water (riff)', 4: 'When the Saints Go Marching In',
    5: 'Here Comes the Bride', 6: 'The Simpsons theme', 7: 'Star Wars main theme', 8: 'Love Story theme',
    9: 'My Bonnie Lies Over the Ocean', 10: 'Star Trek (original theme)', 11: 'Take On Me (chorus leap)', 12: 'Somewhere Over the Rainbow',
  };

  /** ctx: { standard: boolean, tuningName, strings: ['E','A',…] lowest first } */
  function sections(ctx) {
    const openStrings = ctx.strings.map((n, i) => `<b>${n}</b> (${6 - i})`).reverse().join(' · ');
    const standardOnly = html => (ctx.standard ? html : '');

    return {
      free: {
        title: 'Playing freely',
        html: `
          <p>This is a blank neck to experiment on. Nothing is right or wrong here — use it to hear how the fretboard is laid out.</p>
          <ul>
            <li><b>Slide along one string</b> (drag with the mouse): every fret is one semitone, so you hear the chromatic scale.</li>
            <li><b>Same note, different place</b>: ${ctx.standard ? 'the 5th fret of the low E string is the same pitch as the open A string — that\'s how guitarists tune by ear.' : 'find the same pitch on two neighbouring strings; that\'s how guitarists tune by ear.'}</li>
            <li><b>Play a song</b>: pick one from the <i>Song</i> menu. For melodies the glowing dot is the next note and the faint one
            comes after; for chord songs, tap the shape to strum it. <i>Listen</i> plays the whole song first so you know how it goes.</li>
            <li><b>Find a tune you know</b>: start on any note and hunt for the next one by ear. Everything you learn here works in the Ear Training tab.</li>
            ${ctx.standard ? '<li><b>Power chords</b>: switch the sound to <i>overdrive</i> and play a note on the low E string plus the note two frets higher on the A string.</li>' : ''}
          </ul>
          <p><b>The sounds</b> are synthesised, not recorded: a burst of noise feeds a tuned delay line that behaves like a vibrating string.
          Steel strings are bright with a long ring; nylon is softer and darker; the electric tones ring longer, and overdrive
          adds a clipping amp and speaker; palm-muted damps the string almost immediately; and slapback echo is the bright, tape-echoed electric sound Les Paul made famous in the 1950s — try it on the blues shuffles. The sound you choose is used everywhere in the app.</p>`,
      },

      all: {
        title: 'How the notes are laid out',
        html: `
          <p>Western music uses <b>12 notes</b>. Seven have letter names — <b>A B C D E F G</b> — and the other five sit
          between them as sharps (♯, one fret higher) or flats (♭, one fret lower). C♯ and D♭ are the same pitch with two
          names; which name you use depends on the key.</p>
          <ul>
            <li><b>One fret = one semitone</b> (a half step). Two frets = a whole step.</li>
            <li>Every pair of letters is two frets apart <b>except E–F and B–C</b>, which are one fret apart. That's why
            there's no E♯ or B♯ dot between them.</li>
            <li>At the <b>12th fret</b> every string has climbed an <b>octave</b>: the same note names start again, which is
            why the double dot is there. Everything above fret 12 is a copy of frets 0–11.</li>
            <li>Your open strings (${ctx.tuningName}), from the highest: ${openStrings}.
            ${standardOnly('A handy mnemonic for standard tuning, low to high: <i>Eddie Ate Dynamite, Good Bye Eddie</i>.')}</li>
          </ul>
          <p class="learn-tip"><b>Practice:</b> learn the natural notes (turn on <i>Naturals only</i>) on the two lowest strings
          first — they're where most chord roots live.</p>`,
      },

      note: {
        title: 'Finding one note everywhere',
        html: `
          <p>Each note appears <b>once on every string</b> within any 12 frets, so there are 6–8 of each note on a typical
          neck. Some of them are the <b>exact same pitch</b> on different strings (a unison), others are octaves higher or lower.</p>
          <ul>
            ${standardOnly(`<li><b>Octave shapes</b> (standard tuning): from the 6th or 5th string, the octave is <b>two strings up,
            two frets higher</b>. From the 4th or 3rd string it's two strings up and <b>three</b> frets higher, because the B string
            is tuned one fret lower than the pattern. The 6th and 1st strings are both E: same fret, two octaves apart.</li>`)}
            <li><b>Octave numbers</b>: turn on <i>Octave numbers</i> to see which copy is which. The number goes up at every C,
            and C4 is “middle C”. ${ctx.standard ? 'The open low E is E2.' : ''}</li>
          </ul>
          <p class="learn-tip"><b>Practice:</b> pick one note a day, find every copy without looking, and say its name as you play it.
          Then try it in the Note Quiz.</p>`,
      },

      chord: {
        title: 'What a chord is',
        html: `
          <p>A <b>chord</b> is three or more notes sounded together. Chords are built by stacking <b>3rds</b> on top of a
          <b>root</b> (the note that names the chord), and the type of 3rd gives the chord its character.</p>
          <ul>
            <li><b>Major</b> = root, major 3rd, 5th (R 3 5) — bright. ${play('chord:0:maj', 'C')}</li>
            <li><b>Minor</b> = root, minor 3rd, 5th (R ♭3 5) — darker. Only one note changes, and only by one fret. ${play('chord:0:min', 'Cm')}</li>
            <li><b>7th chords</b> add a 4th note: <b>dominant 7</b> (♭7) is bluesy and wants to resolve ${play('chord:0:7', 'C7')},
            <b>major 7</b> (7) is dreamy ${play('chord:0:maj7', 'Cmaj7')}, <b>minor 7</b> is mellow ${play('chord:0:m7', 'Cm7')}.</li>
            <li><b>Sus</b> chords swap the 3rd for a 2nd or 4th, so they're neither major nor minor.
            <b>Diminished</b> (♭3 ♭5) is tense; <b>augmented</b> (3 ♯5) sounds unresolved. A <b>power chord</b> (5) is just root + 5th.</li>
          </ul>
          <p>Guitar shapes usually <b>repeat</b> some notes — open C (x32010) is C E G C E. That's fine: what makes it a C chord is
          which notes are present and that C is the <b>lowest</b> one. The colours show each note's job in the chord.</p>
          <p class="learn-tip"><b>All the shapes:</b> the diagrams above show every way to play the chord on this neck —
          <i>Best per position</i> keeps the most practical shape at each fret, <i>Every shape</i> adds the variations.
          Most chords have a shape near the nut, one around the 5th fret and one around the 7th–10th; learn one in each area.</p>
          <p><b>Progressions</b> (switch to <i>Progressions</i>) use movable shapes only — no open strings — picked so your hand
          moves as little as possible from chord to chord. That smooth movement is called <b>voice leading</b>: notes that two chords
          share stay put, and the others move by a fret or two. Compare the <i>Barre chords</i>, <i>4-string</i> and <i>Triads</i>
          styles — the smaller shapes move least, which is why session players love them. Turn on <i>Show next chord</i> to see
          where your fingers are going before the change.</p>`,
      },

      triad: {
        title: 'Triads and inversions',
        html: `
          <p>A <b>triad</b> is the three-note core of a chord: root, 3rd and 5th. There are four kinds, made from two
          stacked 3rds: <b>major</b> (major 3rd + minor 3rd), <b>minor</b> (minor + major), <b>diminished</b> (minor + minor)
          and <b>augmented</b> (major + major).</p>
          <p>Played on <b>three neighbouring strings</b>, one note each, triads are small, movable shapes. They sit above the
          bass and drums instead of competing with them, which is why so many rhythm parts use them.</p>
          <ul>
            <li><b>Root position</b> — the root is on the bottom (R 3 5). ${play('triad:0:maj:0', 'C')}</li>
            <li><b>1st inversion</b> — the 3rd is on the bottom (3 5 R). ${play('triad:0:maj:1', 'C/E')}</li>
            <li><b>2nd inversion</b> — the 5th is on the bottom (5 R 3). ${play('triad:0:maj:2', 'C/G')}</li>
          </ul>
          <p>Same three notes, different flavour. Stepping through the inversions on one string set walks the chord up the neck.
          When you change chords, moving to the <b>nearest</b> inversion of the next chord gives smooth “voice leading”.</p>
          <p class="learn-tip"><b>Tip:</b> tap any shape to hear it as a chord, or press <i>Arpeggiate</i> to hear its notes one by one.</p>`,
      },

      interval: {
        title: 'What intervals are',
        html: `
          <p>An <b>interval</b> is the distance between two notes, counted in semitones — on the guitar, in <b>frets</b>.
          Chords, scales and melodies are all just patterns of intervals, so learning them is learning how music is put together.
          You can hear an interval <b>melodically</b> (one note after the other) or <b>harmonically</b> (together); the app plays both.</p>
          <div class="learn-table-wrap"><table class="learn-table">
            <thead><tr><th>Name</th><th>Frets</th><th>Sounds like the start of…</th><th></th></tr></thead>
            <tbody>
              ${Theory.INTERVALS.map(i => `<tr><td><b>${i.short}</b> ${i.name}</td><td>${i.semi}</td><td>${INTERVAL_SONGS[i.semi]}</td><td>${play('iv:' + i.semi, 'Hear')}</td></tr>`).join('')}
            </tbody>
          </table></div>
          <ul>
            ${standardOnly(`<li><b>Shapes on the neck</b> (standard tuning): the next string up is a <b>4th</b> (5 frets) higher, so the same
            fret one string up is a P4, two frets further is a P5, and two strings up plus two frets is an octave. Crossing from the
            G string to the B string, every shape moves <b>one fret higher</b>, because those two strings are only 4 frets apart.</li>`)}
            <li><b>Inversions add up to 12.</b> A major 3rd up lands on the same note as a minor 6th down; a 5th up is a 4th down.
            That's why the interval map colours those pairs alike.</li>
            <li>Because the shape doesn't depend on the starting note, an interval you learn once works <b>from any root</b>.</li>
          </ul>`,
      },

      scale: {
        title: 'What a scale is',
        html: `
          <p>A <b>scale</b> is a set of notes to build melodies and chords from. Start with the <b>major scale</b>: it's the reference
          point for almost everything else in Western music. ${play('scale:0:major', 'C major')}</p>
          <ul>
            <li><b>Its pattern</b> is whole, whole, half, whole, whole, whole, half: 2 2 1 2 2 2 1 frets. Play it along one string from
            any note and it comes out right.</li>
            <li><b>Other scales are described by how they differ from it.</b> A ♭3 is the major scale's 3rd lowered one fret; the natural
            minor is R 2 ♭3 4 5 ♭6 ♭7. ${play('scale:9:natural', 'A natural minor')}</li>
            <li><b>Chords come from scales.</b> Stack every other note, starting on each note of the scale, and you get that scale's chords.
            That's why these notes sound right over them: tap a chord in the panel above to see its notes inside the scale.</li>
          </ul>
          <p><b>Where to go next</b></p>
          <ul>
            <li><b>Pentatonics</b> keep just five notes, leaving out the two that clash most easily, so it's very hard to play a “wrong” note.
            They're the backbone of blues, rock and country soloing. ${play('scale:9:minpent', 'A minor pentatonic')}
            The <b>blues scale</b> adds the ♭5 “blue note”. ${play('scale:9:blues', 'A blues')}</li>
            <li><b>Modes</b> are the major scale's notes with a different note as home, and each has its own mood.
            D to D using C major's notes is D Dorian. ${play('scale:2:dorian', 'D Dorian')}</li>
            <li><b>Harmonic and melodic minor</b> raise notes of the natural minor to pull harder toward home. ${play('scale:9:harmonic', 'A harmonic minor')}</li>
          </ul>
          <p><b>Relatives</b> share the same notes: A minor and C major, or A minor pentatonic and C major pentatonic.
          What changes is which note feels like home — the one you start and end phrases on, and the chords underneath.</p>
          <p><b>Shapes.</b> <i>Positions</i> and <i>Boxes</i> keep your hand in one area, and the faint dots show the neighbouring shapes.
          Learn one, then add the shapes on either side. <i>3 notes per string</i> uses the same three-note groups all the way across, which
          suits fast, even picking. Pentatonic <i>Extended</i> shapes cut diagonally across the boxes, alternating two and three notes per
          string: in A minor, 3-5 | 3-5-7 | 5-7 | 5-7-9 | 8-10 | 8-10-12, which is how players travel the neck in a solo.</p>`,
      },

      arp: {
        title: 'Arpeggios',
        html: `
          <p>An <b>arpeggio</b> is a chord played <b>one note at a time</b> instead of all together — a “broken chord”.
          ${play('chord:9:min', 'Am strummed')} ${play('arp:9:min', 'Am as an arpeggio')}</p>
          <ul>
            <li>It has exactly the chord's notes, laid out across the strings in one position like a scale, so you can play
            melodies that spell out the harmony.</li>
            <li>Landing on chord tones — especially the <b>3rd</b> and <b>7th</b> — as the chords change makes a solo sound connected to
            the song instead of floating over it.</li>
            <li>Each shape here starts on a different chord tone on the lowest string; together they cover the neck.</li>
          </ul>
          <p class="learn-tip"><b>Practice:</b> play the arpeggio slowly while the chord rings, then mix it with the pentatonic scale
          from the same root.</p>`,
      },
    };
  }

  // About each scale, for the panel under the neck. deeper: [scale id, how it relates to this one].
  const scaleInfo = {
    major: {
      about: 'The reference point for Western music: bright, settled and familiar. Do-re-mi is this scale, and every other scale is described by how it differs from it. Also called the Ionian mode.',
      deeper: [
        ['natural', 'Its darker relative: lower the 3rd, 6th and 7th'],
        ['majpent', 'Drop the 4th and 7th for an easy, open sound'],
        ['mixolydian', 'Lower the 7th for a bluesy rock feel'],
        ['lydian', 'Raise the 4th for a dreamy, floating feel'],
      ],
    },
    natural: {
      about: 'The standard minor sound: darker and more serious than major, heard all over rock, pop ballads and metal. It uses the same notes as the major scale three frets up, with a different home. Also called the Aeolian mode.',
      deeper: [
        ['minpent', 'Drop the 2nd and ♭6 for the classic soloing scale'],
        ['dorian', 'Raise the 6th for a warmer, jazzier minor'],
        ['harmonic', 'Raise the 7th for a dramatic pull home'],
        ['phrygian', 'Lower the 2nd for a dark, Spanish colour'],
      ],
    },
    minpent: {
      about: 'Five notes, no clashes: the first scale most guitarists learn to solo with, and the sound of blues and rock lead guitar. It is the natural minor without the 2nd and ♭6.',
      deeper: [
        ['blues', 'Add the ♭5 for instant blues'],
        ['natural', 'Add the two missing notes for the full minor scale'],
        ['dorian', 'Add the 2nd and 6th for a jazzier minor'],
      ],
    },
    majpent: {
      about: 'Sweet and open: country licks, soul and melodic rock. It is the major scale without the 4th and 7th, the two notes most likely to clash with the chords.',
      deeper: [
        ['major', 'Add the 4th and 7th for the full major scale'],
        ['minpent', 'Same notes from another root: its relative minor'],
        ['mixolydian', 'Add the 4th and ♭7 for a bluesier major'],
      ],
    },
    blues: {
      about: 'The minor pentatonic plus the ♭5 “blue note”. The ♭5 is tense, so it usually works best as a passing note on the way to the 4th or 5th rather than somewhere to rest.',
      deeper: [
        ['minpent', 'Take the blue note out again'],
        ['mixolydian', 'The major side of the blues'],
        ['dorian', 'The smoother, jazzier side of minor blues'],
      ],
    },
    dorian: {
      about: 'A minor scale with a raised 6th, which makes it warmer and less gloomy than natural minor. Think Santana, funk vamps and modal jazz. Same notes as the major scale a whole step below.',
      deeper: [
        ['natural', 'Lower the 6th for plain minor'],
        ['mixolydian', 'Raise the 3rd for its major-side cousin'],
        ['melodic', 'Raise the 7th as well'],
      ],
    },
    phrygian: {
      about: 'A minor scale with a ♭2, the note that gives it its dark, Spanish sound. Common in flamenco-flavoured playing and metal riffs. Same notes as the major scale a major 3rd below.',
      deeper: [
        ['natural', 'Raise the 2nd for plain minor'],
        ['locrian', 'Lower the 5th as well for the darkest mode'],
        ['harmonic', 'Its fifth mode is the “Phrygian dominant” sound'],
      ],
    },
    lydian: {
      about: 'A major scale with a raised 4th: bright, floating and a little unreal. Often used in film music and by players like Joe Satriani. Same notes as the major scale a perfect 4th below.',
      deeper: [
        ['major', 'Lower the 4th for plain major'],
        ['mixolydian', 'The other major mode, with a ♭7 instead'],
      ],
    },
    mixolydian: {
      about: 'A major scale with a ♭7: confident and bluesy, the sound of a lot of classic rock and of soloing over dominant 7th chords. Same notes as the major scale a perfect 5th below.',
      deeper: [
        ['major', 'Raise the 7th for plain major'],
        ['blues', 'Mix it with the blues scale over a 12-bar'],
        ['dorian', 'Lower the 3rd for the minor-side cousin'],
      ],
    },
    locrian: {
      about: 'The darkest mode: a ♭2 and a ♭5 mean its home chord is diminished, so it never feels settled. It is rarely used as a home key, but it fits over m7♭5 chords and turns up in some metal.',
      deeper: [
        ['phrygian', 'Raise the 5th for a more stable dark sound'],
        ['natural', 'Raise the 2nd and 5th for plain minor'],
      ],
    },
    harmonic: {
      about: 'Natural minor with a raised 7th. That note gives the scale a major V chord and a strong pull home, and the three-fret gap below it sounds exotic. Heard from Bach to neoclassical shred.',
      deeper: [
        ['natural', 'Lower the 7th again'],
        ['melodic', 'Raise the 6th too and the gap disappears'],
        ['phrygian', 'Another dark sound with a ♭2'],
      ],
    },
    melodic: {
      about: 'Natural minor with a raised 6th and 7th: smooth and sophisticated, a minor 3rd over an otherwise major scale. This is the jazz form, the same going up and down; in classical music the raised notes usually fall back on the way down.',
      deeper: [
        ['harmonic', 'Lower the 6th for a more dramatic sound'],
        ['dorian', 'Lower the 7th for the modal version'],
      ],
    },
  };

  return { sections, scaleInfo };
})();
