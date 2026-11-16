// Cinema Seats — github.com/veraetogrex-portfolio · zero dependencies
// Drag across a row to pick seats (or press them with the keyboard); the price counts up.
// Buy, and the seats fold into one ticket that flips to its QR code and drops into your wallet.

const root   = document.querySelector('#seats');
const hall   = root.querySelector('.cs-hall');
const map    = root.querySelector('.cs-map');
const calc   = root.querySelector('.cs-calc');
const sumEl  = root.querySelector('.cs-sum');
const buy    = root.querySelector('.cs-buy');
const tk     = root.querySelector('.cs-tk');
const wallet = root.querySelector('.cs-wallet');
const chips  = root.querySelector('.cs-chips');

const ROWS = 'ABCDEF', COLS = 8, PRICE = 14, W = 72, H = 60, GAP = 16, PITCH = 80, AISLE = 28, X0 = 104;
const TAKEN = ['A2','A3','B6','B7','C1','C4','C5','D1','D7','D8','E3','E4','F5','F6','F8'];
const seats = {};                                          // "D3" → { el, x, y, r, c }
let picked = [], drag = null, busy = false, timers = [], shown = 0;
const later = (fn, ms) => timers.push(setTimeout(fn, ms));

// lay out the hall: rows curve slightly, so the outer seats sit lower like a real auditorium
const mid = (COLS - 1) / 2;
[...ROWS].forEach((r, ri) => {
  const lbl = document.createElement('span'); lbl.className = 'cs-row'; lbl.textContent = r; lbl.setAttribute('aria-hidden', 'true');
  lbl.style.top = ri * PITCH + 14 + 'px'; map.appendChild(lbl);
  for (let c = 1; c <= COLS; c++) {
    const id = r + c, k = c - 1 - mid, x = X0 + (c - 1) * (W + GAP) + (c > COLS / 2 ? AISLE : 0), y = ri * PITCH + k * k * 1.6;
    const el = document.createElement('button'); el.className = 'cs-seat'; el.style.left = x + 'px'; el.style.top = y + 'px';
    el.dataset.id = id; el.textContent = c; el.setAttribute('aria-label', `Row ${r}, seat ${c}`);
    el.addEventListener('click', e => { if (e.detail === 0 && !busy) toggle(id); });   // keyboard: Enter / Space
    map.appendChild(el); seats[id] = { el, x, y, r, c };
  }
});

function reset() {
  timers.forEach(clearTimeout); timers = []; busy = false; drag = null;
  root.classList.remove('is-bought', 'is-pocket', 'is-added');
  root.querySelectorAll('.cs-ghost').forEach(g => g.remove());
  tk.getAnimations().forEach(a => a.cancel()); tk.style.opacity = 0; tk.style.transform = ''; tk.classList.remove('is-back');
  picked = [];
  for (const id in seats) {
    const s = seats[id].el, taken = TAKEN.includes(id);
    s.className = 'cs-seat'; s.disabled = taken; s.style.transform = ''; s.style.opacity = '';
    s.setAttribute('aria-pressed', 'false'); if (taken) s.setAttribute('aria-label', `Row ${seats[id].r}, seat ${seats[id].c}, taken`);
  }
  price(true);
}

// ── picking ────────────────────────────────────────
function pick(id) {
  const s = seats[id];
  if (!s || TAKEN.includes(id) || picked.includes(id) || picked.length >= 8) return;
  picked.push(id); s.el.classList.add('is-on'); s.el.setAttribute('aria-pressed', 'true');
  // the free neighbours lean towards the new seat for a beat
  for (const n of Object.values(seats)) {
    const dr = ROWS.indexOf(n.r) - ROWS.indexOf(s.r), dc = n.c - s.c, nid = n.el.dataset.id;
    if (n === s || Math.abs(dr) > 1 || Math.abs(dc) > 2 || TAKEN.includes(nid) || picked.includes(nid)) continue;
    const d = Math.hypot(dr, dc);
    n.el.style.transform = `translate(${-Math.sign(dc) * 5 / d}px, ${-Math.sign(dr) * 4 / d}px)`;
    n.el.classList.add('is-nudge');
    later(() => { n.el.style.transform = ''; n.el.classList.remove('is-nudge'); }, 260);
  }
  price();
}
function unpick(id) { picked = picked.filter(p => p !== id); seats[id].el.classList.remove('is-on'); seats[id].el.setAttribute('aria-pressed', 'false'); price(); }
const toggle = id => picked.includes(id) ? unpick(id) : pick(id);

function price(instant) {
  // label and total change in the same frame, so they never disagree
  const n = picked.length;
  calc.textContent = n ? `${n} seat${n > 1 ? 's' : ''} × $${PRICE}` : `Pick your seats · $${PRICE} each`;
  sumEl.textContent = '$' + n * PRICE;
  // chips follow the selection: keep the ones already shown, add the new one with a pop
  const want = [...picked].sort((a, b) => a.localeCompare(b) || 0);
  [...chips.children].forEach(ch => { if (!want.includes(ch.textContent)) ch.remove(); });
  want.forEach(id => { if (![...chips.children].some(ch => ch.textContent === id)) { const b = document.createElement('b'); b.textContent = id; chips.appendChild(b); } });
  [...chips.children].sort((a, b) => a.textContent.localeCompare(b.textContent)).forEach(ch => chips.appendChild(ch));
  buy.classList.toggle('is-ready', n > 0); buy.setAttribute('aria-disabled', n ? 'false' : 'true');
  if (!instant && n !== shown) { sumEl.classList.remove('is-pop'); void sumEl.offsetWidth; sumEl.classList.add('is-pop'); }
  shown = n;
}

// drag across seats: mouse, finger or the scripted demo
const seatAt = e => { const el = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList && x.classList.contains('cs-seat')); return el && el.dataset.id; };
function endDrag() { drag = null; removeEventListener('pointermove', onMove); }
map.addEventListener('pointerdown', e => {
  if (busy) return;
  const id = seatAt(e); if (!id || TAKEN.includes(id)) return;
  drag = { adding: !picked.includes(id) };
  drag.adding ? pick(id) : unpick(id);
  addEventListener('pointermove', onMove); addEventListener('pointerup', endDrag, { once: true }); addEventListener('pointercancel', endDrag, { once: true });
});
function onMove(e) { const id = seatAt(e); if (!id || !drag) return; if (drag.adding) pick(id); else if (picked.includes(id)) unpick(id); }

// ── buying ─────────────────────────────────────────
function label(ids) {
  const s = ids.map(i => seats[i]).sort((a, b) => a.r.localeCompare(b.r) || a.c - b.c), r = s[0].r, same = s.every(x => x.r === r);
  const span = list => list.length > 1 ? `${list[0].c}–${list[list.length - 1].c}` : `${list[0].c}`;
  return same ? { row: r, text: `${r}${span(s).replace('–', '–' + r)}`, seats: span(s) } : { row: '·', text: s.map(x => x.r + x.c).join(' '), seats: s.map(x => x.r + x.c).join(', ') };
}
// position of an element inside the component, in its own pixels (works inside zoom and scaled stages)
function box(el) { const r = el.getBoundingClientRect(), o = root.getBoundingClientRect(), k = o.width / root.offsetWidth;
  return { x: (r.left - o.left) / k, y: (r.top - o.top) / k, w: r.width / k, h: r.height / k }; }

buy.addEventListener('click', () => {
  if (!picked.length || busy) return;
  busy = true;
  const L = label(picked), n = picked.length;
  root.querySelector('.cs-tseats').textContent = L.text; root.querySelector('.cs-trow').textContent = L.row;
  root.querySelector('.cs-tn').textContent = `${n} seat${n > 1 ? 's' : ''}`;
  root.querySelector('.cs-bseats').textContent = `Row ${L.row} · seat${n > 1 ? 's' : ''} ${L.seats}`;

  // the picked seats lift out of the hall and fly into the stub of the ticket
  const T = { x: tk.offsetLeft, y: tk.offsetTop }, aim = { x: T.x + 545, y: T.y + 145 };
  picked.forEach((id, k) => {
    const s = seats[id], from = box(s.el), g = document.createElement('div'); g.className = 'cs-ghost'; g.textContent = s.c;
    g.style.left = from.x + 'px'; g.style.top = from.y + 'px'; root.appendChild(g); s.el.style.opacity = 0;
    const dx = aim.x - (from.x + W / 2), dy = aim.y - (from.y + H / 2);
    g.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * .2}px, -40px) scale(1.15)`, opacity: 1, offset: .35 },
               { transform: `translate(${dx}px, ${dy}px) scale(.9)`, opacity: 1, offset: .8 }, { transform: `translate(${dx}px, ${dy}px) scale(.4)`, opacity: 0 }],
      { duration: 620, delay: k * 60, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  });
  root.classList.add('is-bought');
  later(() => {                                             // the ticket snaps in where the seats landed
    tk.style.opacity = 1;
    tk.animate([{ opacity: 0, transform: 'translateY(30px) scale(.85) rotate(-4deg)' }, { opacity: 1, transform: 'translateY(-6px) scale(1.03) rotate(1deg)', offset: .6 }, { opacity: 1, transform: 'none' }],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }, 560 + (n - 1) * 60);
  later(() => tk.classList.add('is-back'), 1350);          // flip to the QR
  later(() => root.classList.add('is-pocket'), 2200);       // the wallet opens in the side column
  later(() => {                                             // flip back to the face and drop into the wallet
    tk.classList.remove('is-back');
    const w = box(wallet), k = w.w / tk.offsetWidth;
    tk.animate([{ transform: 'none' }, { transform: `translate(${(w.x - T.x) * .5}px, ${(w.y - T.y) * .5 - 60}px) scale(${(1 + k) / 2}) rotate(-3deg)`, offset: .5 },
                { transform: `translate(${w.x - T.x}px, ${w.y + 50 - T.y}px) scale(${k})` }],
      { duration: 820, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
  }, 2350);
  later(() => root.classList.add('is-added'), 3150);
});

// fade back to the first frame (used when a demo loops)
function rewind() {
  root.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)', offset: .45 }, { opacity: 0, filter: 'blur(8px)', offset: .55 }, { opacity: 1, filter: 'blur(0px)' }], { duration: 700, easing: 'ease-in-out' });
  setTimeout(reset, 320);
}

// a QR-looking code (decorative): three finder squares + a fixed pseudo-random fill
(function qr() {
  const svg = root.querySelector('.cs-qr'); let out = '', seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#15161c"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#f6f2ea"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#15161c"/>`;
  for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
    const inF = (x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16);
    if (!inF && rnd() > .52) out += `<rect x="${x}" y="${y}" width="1" height="1" fill="#15161c"/>`;
  }
  svg.innerHTML = out + finder(0, 0) + finder(18, 0) + finder(0, 18);
})();

reset();
root.cinema = { reset, rewind, seat: id => seats[id].el, buy };   // for scripted demos
