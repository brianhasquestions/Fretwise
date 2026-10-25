/* Renders an interactive fretboard as a CSS grid and exposes a small marker API. */
class Fretboard {
  static INLAYS = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24];

  constructor(el, { frets = 15, flipped = false, onPress } = {}) {
    this.el = el;
    this.frets = frets;
    this.flipped = flipped;
    this.onPress = onPress;
    const press = cell => { if (cell && el.contains(cell) && this.onPress) this.onPress(+cell.dataset.s, +cell.dataset.f, cell); };
    el.addEventListener('click', e => {
      if (!this.pointerPlay) press(e.target.closest('.fb-cell'));
    });

    // Instrument mode: sound on press (lower latency, several fingers at once on touchscreens),
    // and with a mouse, dragging across strings strums and dragging along a string slides.
    this.pointerPlay = false;
    this.dragCell = null;
    el.addEventListener('pointerdown', e => {
      if (!this.pointerPlay) return;
      const cell = e.target.closest('.fb-cell');
      if (!cell) return;
      e.preventDefault();
      this.dragCell = e.pointerType === 'mouse' ? cell : null;
      press(cell);
    });
    el.addEventListener('pointermove', e => {
      if (!this.pointerPlay || !this.dragCell || !(e.buttons & 1)) return;
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const cell = hit && hit.closest('.fb-cell');
      if (cell && cell !== this.dragCell && el.contains(cell)) {
        this.dragCell = cell;
        press(cell);
      }
    });
    window.addEventListener('pointerup', () => { this.dragCell = null; });
    this.render();
  }

  setPointerPlay(on) {
    this.pointerPlay = on;
    this.el.classList.toggle('free-play', on);
  }

  setOptions({ frets, flipped }) {
    let changed = false;
    if (frets != null && frets !== this.frets) { this.frets = frets; changed = true; }
    if (flipped != null && flipped !== this.flipped) { this.flipped = flipped; changed = true; }
    if (changed) this.render();
    return changed;
  }

  rowOf(s) { return this.flipped ? s + 1 : 6 - s; }

  render() {
    const el = this.el;
    const F = this.frets;
    const make = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    el.replaceChildren();

    // Frets shrink toward the body like a real neck (softened so high frets stay tappable).
    const ratios = [];
    for (let f = 1; f <= F; f++) ratios.push(Math.pow(2, -(f - 1) / 20));
    el.style.gridTemplateColumns = `2.25rem 3.25rem ${ratios.map(r => r.toFixed(4) + 'fr').join(' ')}`;
    el.style.minWidth = Math.round(88 + ratios.reduce((a, b) => a + b, 0) * 66) + 'px';

    const wood = make('div', 'fb-wood');
    wood.style.gridColumn = `3 / ${F + 3}`;
    wood.style.gridRow = '1 / 7';
    el.append(wood);

    this.cells = Array.from({ length: 6 }, () => []);
    this.labels = [];
    for (let s = 0; s < 6; s++) {
      const row = this.rowOf(s);
      const label = make('div', 'fb-label', Theory.STRING_NAMES[s]);
      label.style.gridRow = row;
      label.style.gridColumn = 1;
      el.append(label);
      this.labels[s] = label;
      for (let f = 0; f <= F; f++) {
        const b = make('button', 'fb-cell' + (f === 0 ? ' fb-open' : ''));
        b.type = 'button';
        b.tabIndex = -1;
        b.dataset.s = s;
        b.dataset.f = f;
        b.style.gridRow = row;
        b.style.gridColumn = f + 2;
        b.setAttribute('aria-label', `${Theory.STRING_LONG[s]} string, ${f === 0 ? 'open' : 'fret ' + f}`);
        b.append(make('span', 'fb-str str-' + s), make('span', 'fb-dot'));
        el.append(b);
        this.cells[s][f] = b;
      }
    }

    for (const f of Fretboard.INLAYS) {
      if (f > F) continue;
      const inlay = make('div', 'fb-inlay' + (f % 12 === 0 ? ' double' : ''));
      inlay.style.gridColumn = f + 2;
      inlay.style.gridRow = '1 / 7';
      inlay.append(make('span'));
      if (f % 12 === 0) inlay.append(make('span'));
      el.append(inlay);
    }

    for (let f = 0; f <= F; f++) {
      const num = make('div', 'fb-num' + (Fretboard.INLAYS.includes(f) ? ' is-inlay' : ''), f === 0 ? 'open' : String(f));
      num.style.gridRow = 7;
      num.style.gridColumn = f + 2;
      el.append(num);
    }
  }

  cell(s, f) { return (this.cells[s] && this.cells[s][f]) || null; }

  forEachCell(fn) {
    this.cells.forEach((row, s) => row.forEach((c, f) => fn(c, s, f)));
  }

  clear() {
    this.forEachCell(c => {
      if (!c.classList.contains('marked')) return;
      c.classList.remove('marked');
      c.lastChild.className = 'fb-dot';
      c.lastChild.textContent = '';
    });
  }

  mark(s, f, { label = '', cls = 'dot-note' } = {}) {
    const c = this.cell(s, f);
    if (!c) return;
    const dot = c.lastChild;
    c.classList.add('marked');
    dot.className = 'fb-dot';
    void dot.offsetWidth; // restart entry animations
    dot.className = 'fb-dot ' + cls + (String(label).length >= 3 ? ' is-small' : '');
    dot.textContent = label;
  }

  unmark(s, f) {
    const c = this.cell(s, f);
    if (!c) return;
    c.classList.remove('marked');
    c.lastChild.className = 'fb-dot';
    c.lastChild.textContent = '';
  }

  /** Dim cells outside a fret range / string set. Pass null to clear. */
  setRange(min, max, strings) {
    this.forEachCell((c, s, f) => {
      const out = min != null && (f < min || f > max || !strings[s]);
      c.classList.toggle('out', out);
    });
    this.labels.forEach((l, s) => l.classList.toggle('out', min != null && !strings[s]));
  }

  highlightString(target) {
    this.forEachCell((c, s) => c.classList.toggle('str-hi', s === target));
    this.labels.forEach((l, s) => l.classList.toggle('str-hi', s === target));
  }

  /** Visual "pluck" of a string. */
  pluck(s) {
    const row = this.cells[s];
    if (!row) return;
    row.forEach(c => c.classList.remove('plucked'));
    void this.el.offsetWidth;
    row.forEach(c => c.classList.add('plucked'));
  }

  setInteractive(on) { this.el.classList.toggle('interactive', on); }

  /** Briefly ring a set of positions (e.g. everywhere a note the microphone heard can be played). */
  ring(list) {
    clearTimeout(this.ringTimer);
    this.forEachCell(c => c.classList.remove('heard'));
    void this.el.offsetWidth;
    list.forEach(({ s, f }) => { const c = this.cell(s, f); if (c) c.classList.add('heard'); });
    this.ringTimer = setTimeout(() => this.forEachCell(c => c.classList.remove('heard')), 1800);
  }

  /** Scroll the (horizontally scrollable) neck so a fret is in view. No-op when it all fits. */
  scrollToFret(f) {
    const sc = this.el.parentElement;
    const cell = this.cell(0, Math.max(0, Math.min(this.frets, f)));
    if (!sc || !cell || sc.scrollWidth <= sc.clientWidth) return;
    const left = cell.offsetLeft - sc.clientWidth / 2 + cell.offsetWidth / 2;
    sc.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }
}
