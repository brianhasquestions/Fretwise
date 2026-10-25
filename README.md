# Fretwise

A guitar fretboard trainer that runs in the browser — and on Android. Learn where every note lives, build chords and
triads anywhere on the neck, drill pentatonic boxes and arpeggios, train your ear, and jam over a backing band.
It can listen to your real guitar through the microphone, so you can answer the quizzes by playing.

Plain HTML, CSS and JavaScript: no frameworks, no build step, no external services. All sound is synthesised in the
browser, so it works offline.

## Features

**Explore**
- **Free play** — a blank neck to play on, with six guitar sounds (steel-string, nylon, clean electric, overdrive,
  palm-muted and a 1950s slapback-echo electric). Drag across the strings to strum, or tap with several fingers on a
  touchscreen.
- **Songs to play along with** — public-domain melodies (Ode to Joy, Greensleeves, Für Elise…), traditional chord songs,
  and blues forms, riffs and an original 12-bar study. The next note glows on the neck; *Listen* plays the song first.
- **Notes** — every note on the neck, or every place one note lives.
- **Chords** — every playable shape of a chord as chord diagrams, plus **Progressions**: 16 progressions (pop, jazz,
  neo-soul, minor and more) voiced with movable shapes and smooth voice leading, in barre, 4-string or triad styles.
- **Triads**, **Intervals** (with an interval map around any root), **Pentatonics** (the five boxes and the extended
  diagonal shapes) and **Arpeggios**.
- An expandable explanation of each concept under the neck, with examples you can hear.

**Quizzes** — each with scores, streaks and timing, and more practice on what you get wrong
- **Note Quiz** — find a note on a string, name a note, or find every instance of a note.
- **Chord Quiz** — build a chord or a triad (in a given inversion) on the neck, or name one.
- **Scale Quiz** — play a pentatonic or arpeggio shape, or name the degree of a note in it.
- **Intervals** — find or name intervals on the neck.
- **Ear Training** — find a note by ear, play back short phrases, and recognise intervals and chord qualities.

**Tools**
- **Microphone answers** — play your answer on a real guitar (pitch detection runs locally in the browser).
- **Tuner** with A4 calibration.
- **Metronome**, and **Jam tracks**: a backing band (drums, bass, rhythm guitar) in eight styles — rock, blues shuffle,
  slow blues, funk, pop, reggae, bossa nova and jazz swing — over 13 progressions in any key, with a suggested scale to
  solo with.
- **14 tunings** — standard, E♭, D and C standard, drop D/C/B, double drop D, DADGAD and open D/G/E/A/C. Every view,
  quiz and chord shape adapts to the tuning.
- Light and dark themes, adjustable neck length, sharps or flats, and the low string shown on top or bottom.

## Running it

Serve the folder with any static web server and open it in a browser. For example, with Python:

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>.

Opening `index.html` directly from disk mostly works, but browsers only allow the **microphone** (tuner and answering
by playing) on a secure origin such as `http://localhost` or HTTPS, so use a server for those.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `N` | Next question / skip |
| `Enter` | Check or continue |
| `Space` | Replay / strum / listen (depends on the exercise) |
| `A`–`G`, `Shift`+letter | Answer "name the note" (Shift for sharps) |
| `1`–`9` | Pick an answer button |
| `R` | Reference note (ear training) |
| `M` | Start / stop the metronome |
| `J` | Start / stop the jam track |

## Android app

The web app is wrapped as an Android app with [Capacitor](https://capacitorjs.com/). You need Node.js, JDK 21 and the
Android SDK (Android Studio installs both).

```bash
npm install
npm run android:sync
```

`android:sync` copies the web files into `www/` and from there into the Android project. Then either open `android/`
in Android Studio, or plug in a phone with USB debugging enabled and run:

```bash
npx cap run android
```

The app asks for microphone permission the first time you use the tuner or microphone answers.

## Project layout

| File | What it does |
|---|---|
| `index.html`, `styles.css` | Page structure and styling (light and dark themes) |
| `js/theory.js` | Notes, tunings, chords and voicing search, scales and shapes, intervals, triads |
| `js/audio.js` | Plucked-string guitar synth (Karplus–Strong) with tone presets, drive and echo |
| `js/fretboard.js` | The interactive fretboard |
| `js/app.js` | The app: Explore views, quizzes, ear training, microphone answers, settings |
| `js/pitch.js` | Microphone pitch detection (YIN) |
| `js/tuner.js` | Tuner |
| `js/metronome.js` | Metronome and the metronome/jam panel |
| `js/jam.js` | Jam tracks: synthesised drums and bass, styles and progressions |
| `js/progressions.js` | Chord progressions and voice-leading shape selection |
| `js/songs.js` | Songs for Free play |
| `js/learn.js` | The explanations shown under the neck |
| `scripts/build-web.mjs` | Copies the web app into `www/` for Capacitor |
| `android/` | Capacitor Android project |

## Notes

- Everything you hear is generated in the browser: the guitar is a physical-model synth, and the drums and bass are
  built from oscillators and filtered noise. No audio files are used.
- The songs are public-domain tunes, traditional blues forms and riffs, and one original study. Copyrighted songs are
  deliberately not included.
- Settings and progress are stored in the browser's local storage; nothing leaves your device.
