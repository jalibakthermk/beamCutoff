/* ---------- report export (HTML / PDF / CSV / JSON) ---------- */
const PRINT_DATE = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); };
const baseName = () => (state.name || 'beam').replace(/^Built-in example.*$/, 'example').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '_').slice(0, 60);

function tableData(tbl) {
  if (!tbl || !tbl.rows.length) return null;
  const head = [...tbl.querySelectorAll('thead th')].map(th => th.innerText.replace(/\s+/g, ' ').trim());
  const rows = [...tbl.querySelectorAll('tbody tr')].map(tr => ({
    fail: tr.classList.contains('fail'),
    cells: [...tr.children].map(td => {
      const pill = td.querySelector('.pill');
      return {
        text: pill ? pill.textContent.trim() : td.innerText.replace(/[ \t]+/g, ' ').replace(/\n+/g, '\n').trim(),
        pill: pill ? pill.textContent.trim() : null,
        ok: td.classList.contains('ok'), bad: td.classList.contains('bad'), nom: td.classList.contains('nom'),
        num: td.classList.contains('num'), th: td.tagName === 'TH'
      };
    })
  }));
  return { head, rows };
}
const kvData = (el) => [...el.children].filter(d => d.children.length >= 2).map(d => [d.children[0].innerText.trim(), d.children[1].innerText.trim()]);

function buildModel() {
  const tr = $('tblReg'), had = tr.classList.contains('only-fail');
  tr.classList.remove('only-fail');
  try { return buildModelInner(); } finally { if (had) tr.classList.add('only-fail'); }
}
function buildModelInner() {
  const r = state.res, o = r.options;
  const tiles = [...$('tiles').children].map(t => ({
    k: t.querySelector('.k').innerText.trim(), v: t.querySelector('.v').innerText.trim(), s: t.querySelector('.s').innerText.trim(),
    st: t.classList.contains('verdict-ok') ? 'ok' : t.classList.contains('verdict-bad') ? 'bad' : null
  }));
  const settings = [
    ['Regulation', 'UN R149, 00 series, passing beam Class C'],
    ['Traffic side', ({ auto: 'detected from cut-off shape', RHT: 'right-hand traffic (set)', LHT: 'left-hand traffic (set)' })[o.traffic]],
    ['Aim', $('optAim').selectedOptions[0].textContent],
    ['Kink for horizontal aim', $('optHMethod').selectedOptions[0].textContent],
    ['Cut-off target', fmt(Math.abs(o.target), 2) + '°D'],
    ['Extra shift (V / H)', fmt(o.dvExtra, 2) + '° / ' + fmt(o.dhExtra, 2) + '°'],
    ['Detector aperture (cut-off line)', $('optDet').selectedOptions[0].textContent],
    ['Mounting height', fmt(o.mountH, 2) + ' m']
  ];
  const warnings = [...$('banners').querySelectorAll('li')].map(li => li.innerText.trim());
  if (state.isExample) warnings.unshift('Built-in synthetic example beam, not a real lamp.');
  const vEl = $('verdict');
  const verdict = { big: vEl.querySelector('.big').innerText.trim(), what: vEl.querySelector('.what').innerText.trim(),
    st: vEl.classList.contains('ok') ? 'ok' : vEl.classList.contains('bad') ? 'bad' : 'na',
    fails: [...vEl.querySelectorAll('.fails button')].map(b => (b.querySelector('b').innerText + ' ' + b.querySelector('span').innerText).replace(/\s+/g, ' ').trim()) };
  const verdictBanner = r.verdict && r.type !== 'asym' ? r.verdict : null;
  const asym = r.type === 'asym';
  return {
    file: state.name, date: PRINT_DATE(), example: state.isExample, type: r.type, tiles, verdict, settings, warnings, verdictBanner,
    cut: r.type !== 'none' ? tableData($('tblCut')) : null,
    kink: r.type !== 'none' ? kvData($('kinkKv')) : [],
    regTitle: asym ? $('regTitle').innerText : null, regSub: asym ? $('regSub').innerText : null,
    reg: asym ? tableData($('tblReg')) : null,
    robust: asym ? tableData($('tblRob')) : null,
    extra: kvData($('extraKv')), ranges: tableData($('tblRange')),
    fileKv: kvData($('fileKv')),
    notes: [...$('methodNotes').querySelectorAll('li')].map(li => li.innerText.trim())
  };
}

function captureCharts() {
  const root = document.documentElement, prev = root.getAttribute('data-theme'), prevView = state.view;
  root.setAttribute('data-theme', 'light');
  state.view = 'aimed';
  const mk = (w) => { const c = document.createElement('canvas'); c.__w = w; c.__dpr = 2; return c; };
  const out = {};
  try {
    if (state.res.type !== 'none') {
      out.map = mk(1000); drawMap(out.map);
      out.vscan = mk(640); drawVScan(out.vscan);
      out.cline = mk(640); drawCLine(out.cline);
    }
  } finally {
    state.view = prevView;
    if (prev == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', prev);
  }
  return out;
}
const MAP_CAPTION = 'Aimed beam, screen angles in degrees, log scale. Magenta: cut-off line (G ≥ 0.08), ◆ kink. Dots and lines: R149 test points and segments (green pass, red fail). Dashed polygon: Zone III. Isolines 625, 1 750, 5 100, 10 100, 20 000 cd.';

/* ----- HTML report ----- */
function htmlReport(M, imgs) {
  const e = esc;
  const tbl = (T, opt) => {
    if (!T) return '';
    opt = opt || {};
    return '<table' + (opt.cls ? ' class="' + opt.cls + '"' : '') + '><thead><tr>' + T.head.map((h, i) => '<th' + (T.rows[0] && T.rows[0].cells[i] && T.rows[0].cells[i].num ? ' class="num"' : '') + '>' + e(h) + '</th>').join('') + '</tr></thead><tbody>' +
      T.rows.map(rw => '<tr' + (rw.fail ? ' class="fail"' : '') + '>' + rw.cells.map(c => {
        const cls = [c.num ? 'num' : '', c.ok ? 'ok' : '', c.bad ? 'bad' : '', c.nom ? 'nom' : ''].filter(Boolean).join(' ');
        const inner = c.pill ? '<span class="pill ' + (c.pill === 'PASS' ? 'ok' : c.pill === 'FAIL' ? 'bad' : 'na') + '">' + e(c.pill) + '</span>' : e(c.text).replace(/\n/g, '<br>');
        return '<' + (c.th ? 'th' : 'td') + (cls ? ' class="' + cls + '"' : '') + '>' + inner + '</' + (c.th ? 'th' : 'td') + '>';
      }).join('') + '</tr>').join('') + '</tbody></table>';
  };
  const kv = (P) => '<dl class="kv">' + P.map(([a, b]) => '<div><dt>' + e(a) + '</dt><dd>' + e(b) + '</dd></div>').join('') + '</dl>';
  const img = (c, alt) => c ? '<img src="' + c.toDataURL('image/png') + '" alt="' + e(alt) + '">' : '';
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Cut-off report: ' + e(M.file) + '</title><style>' +
    ':root{--text:#161616;--t2:#525a66;--rule:#d5d9e0;--accent:#0f62fe;--ok:#198038;--bad:#da1e28;--okbg:#defbe6;--badbg:#fff1f1;--cut:#d02670;color-scheme:light}' +
    '*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--text);font:13px/1.45 "IBM Plex Sans","Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '.verdict{display:flex;gap:18px;align-items:center;border:1px solid var(--rule);border-left:6px solid var(--t2);padding:12px 16px;margin-top:16px}.verdict.ok{border-left-color:var(--ok)}.verdict.bad{border-left-color:var(--bad)}.verdict .big{font-size:24px;font-weight:600}.verdict.ok .big{color:var(--ok)}.verdict.bad .big{color:var(--bad)}.verdict .what{color:var(--t2);font-size:12.5px}.verdict .fl{color:var(--bad);margin-top:4px}.brand{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:14px}.brand b{font-weight:600}.page{max-width:1000px;margin:0 auto;padding:32px 28px 48px}h1{font-size:24px;margin:0 0 4px;font-weight:600}h2{font-size:16px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--text);font-weight:600}' +
    '.meta{color:var(--t2);font-size:12.5px}.mono,td.num,th.num{font-family:"IBM Plex Mono",Consolas,monospace;font-variant-numeric:tabular-nums}' +
    '.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;background:var(--rule);border:1px solid var(--rule);margin-top:16px}.tile{background:#fff;padding:10px 12px}.tile.ok{box-shadow:inset 4px 0 0 var(--ok)}.tile.bad{box-shadow:inset 4px 0 0 var(--bad)}' +
    '.tile .k{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--t2)}.tile .v{font-size:17px;font-weight:600}.tile .s{font-size:11.5px;color:var(--t2)}' +
    'img{max-width:100%;display:block;border:1px solid var(--rule)}.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cap{font-size:11.5px;color:var(--t2);margin:6px 0 0}' +
    'table{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--t2);padding:6px 8px;border-bottom:1px solid var(--t2)}' +
    'td{padding:5px 8px;border-bottom:1px solid var(--rule);vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}tr.fail td:first-child{box-shadow:inset 3px 0 0 var(--bad)}' +
    '.pill{display:inline-block;padding:0 7px;font-size:10.5px;font-weight:600}.pill.ok{background:var(--okbg);color:var(--ok)}.pill.bad{background:var(--badbg);color:var(--bad)}.pill.na{background:#eef0f3;color:var(--t2)}' +
    '.robust td,.robust th{text-align:center}.robust td.ok{background:var(--okbg);color:var(--ok)}.robust td.bad{background:var(--badbg);color:var(--bad)}.robust td.nom{outline:2px solid var(--accent);outline-offset:-2px}' +
    '.kv{display:grid;grid-template-columns:1fr 1fr;gap:0 24px;margin:6px 0}.kv div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--rule);padding:4px 0}.kv dt{color:var(--t2)}.kv dd{margin:0;text-align:right;font-family:"IBM Plex Mono",Consolas,monospace}' +
    '.note{border-left:3px solid #b28600;background:#fcf4d6;padding:8px 12px;font-size:12.5px;margin-top:12px}.note.bad{border-color:var(--bad);background:var(--badbg)}ul.notes{font-size:11.5px;color:var(--t2);padding-left:18px}' +
    'footer{margin-top:32px;font-size:11px;color:var(--t2);border-top:1px solid var(--rule);padding-top:8px}' +
    '@media(max-width:700px){.tiles,.two,.kv{grid-template-columns:1fr}}' +
    '@page{size:A4;margin:14mm}@media print{.page{padding:0;max-width:none}h2{break-after:avoid}table,img,.tiles{break-inside:avoid}tr{break-inside:avoid}}' +
    '</style></head><body><div class="page">' +
    '<div class="brand"><svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><defs><radialGradient id="g" cx="0.55" cy="0.68" r="0.62"><stop offset="0" stop-color="#fff6d6"/><stop offset="0.22" stop-color="#ffe14d"/><stop offset="0.5" stop-color="#3cbf8a"/><stop offset="0.78" stop-color="#1f78b4"/><stop offset="1" stop-color="#1d3a8a"/></radialGradient><clipPath id="c"><rect width="32" height="32" rx="7"/></clipPath></defs><g clip-path="url(#c)"><rect width="32" height="32" fill="#0a0f2c"/><path d="M0 19.5H14L18.5 14.5H32V32H0Z" fill="url(#g)"/><path d="M3 19.5H14L18.5 14.5H29" fill="none" stroke="#ff7eb6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="19.5" r="1.9" fill="#fff"/></g></svg><span>beam<b>Cutoff</b></span></div>' +
    '<h1>Cut-off analysis report</h1><div class="meta">File <span class="mono">' + e(M.file) + '</span> · generated ' + e(M.date) + ' with beamCutoff</div>' +
    (M.verdictBanner ? '<div class="note' + (M.type === 'none' ? ' bad' : '') + '">' + e(M.verdictBanner) + '</div>' : '') +
    (M.warnings.length ? '<div class="note"><strong>Notes on this file</strong><ul>' + M.warnings.map(w => '<li>' + e(w) + '</li>').join('') + '</ul></div>' : '') +
    '<div class="verdict ' + M.verdict.st + '"><div class="big">' + e(M.verdict.big) + '</div><div class="what">' + e(M.verdict.what) + (M.verdict.fails.length ? '<div class="fl">Failing: ' + M.verdict.fails.map(e).join(' · ') + '</div>' : '') + '</div></div>' +
    '<div class="tiles">' + M.tiles.map(t => '<div class="tile' + (t.st ? ' ' + t.st : '') + '"><div class="k">' + e(t.k) + '</div><div class="v">' + e(t.v) + '</div><div class="s">' + e(t.s) + '</div></div>').join('') + '</div>' +
    '<h2>Settings</h2>' + kv(M.settings) +
    (imgs.map ? '<h2>Candela map</h2>' + img(imgs.map, 'Candela map') + '<p class="cap">' + e(MAP_CAPTION) + '</p>' +
      '<div class="two"><div><h2>Vertical scans</h2>' + img(imgs.vscan, 'Vertical scans') + '<p class="cap">log I (solid) and G (dashed) at 1.5°, 2.5°, 3.5° on the horizontal part, file angles.</p></div><div><h2>Cut-off line</h2>' + img(imgs.cline, 'Cut-off line') + '<p class="cap">Inflection position per vertical scan, file angles; dashed grey: G.</p></div></div>' : '') +
    (M.cut ? '<h2>Cut-off quality and aiming (Annex 6)</h2>' + tbl(M.cut) + kv(M.kink) : '') +
    (M.reg ? '<h2>' + e(M.regTitle) + '</h2><p class="meta">' + e(M.regSub) + '</p>' + tbl(M.reg) : '') +
    (M.robust ? '<h2>Aim robustness</h2><p class="meta">Failing photometric items when the aimed beam is moved away from nominal. Outlined cell: nominal aim.</p>' + tbl(M.robust, { cls: 'robust' }) : '') +
    '<h2>Additional beam data</h2>' + kv(M.extra) + tbl(M.ranges) +
    '<h2>File</h2>' + kv(M.fileKv) +
    '<h2>Method</h2><ul class="notes">' + M.notes.map(n => '<li>' + e(n) + '</li>').join('') + '</ul>' +
    '<footer>beamCutoff · UN R149 (00 series) Class C · values computed from the IES file in the browser; verify limits against your controlled copy of the regulation.</footer>' +
    '</div></body></html>';
}

/* ----- minimal PDF writer (Helvetica, WinAnsi, JPEG images) ----- */
const PDF = (function () {
  const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
    334, 260, 334, 584];
  const HELVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
    333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500,
    389, 280, 389, 584];
  const EXT = { 0xB0: 400, 0xB7: 278, 0xD7: 584, 0xD8: 778, 0x85: 1000, 0x96: 556, 0x97: 1000, 0xB1: 584, 0xB5: 556, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0xB2: 333, 0xB3: 333, 0xE9: 556, 0xFC: 556, 0xF6: 556, 0xE4: 556, 0xA7: 556 };
  const MAP = { '§': 0xA7, '°': 0xB0, '·': 0xB7, '×': 0xD7, 'Ø': 0xD8, '…': 0x85, '–': 0x96, '—': 0x97, '±': 0xB1, 'µ': 0xB5, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '²': 0xB2, '³': 0xB3, 'é': 0xE9, 'ü': 0xFC, 'ö': 0xF6, 'ä': 0xE4 };
  const REPL = { '≥': '>=', '≤': '<=', '◆': '*', '≈': '~', '→': '->', 'γ': 'gamma', 'Δ': 'delta', ' ': ' ', ' ': ' ', ' ': ' ', '−': '-', '∩': 'n' };
  function enc(s) {
    let o = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) o += ch;
      else if (MAP[ch]) o += String.fromCharCode(MAP[ch]);
      else if (REPL[ch] != null) o += REPL[ch];
      else if (c === 10) o += '\n';
      else o += '?';
    }
    return o;
  }
  const cw = (c, b) => (c >= 32 && c < 127) ? (b ? HELVB : HELV)[c - 32] : (EXT[c] || 556);
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const n2 = (x) => (Math.round(x * 100) / 100).toString();
  const rgb = (h) => { const c = hex(h); return c.map(v => n2(v / 255)).join(' '); };

  function jpegOf(canvas) { // flatten transparency onto white, then JPEG
    const t = document.createElement('canvas'); t.width = canvas.width; t.height = canvas.height;
    const x = t.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, t.width, t.height); x.drawImage(canvas, 0, 0);
    return atob(t.toDataURL('image/jpeg', 0.92).split(',')[1]);
  }
  class Doc {
    constructor(title) {
      this.W = 595.28; this.H = 841.89; this.M = 40; this.CW = this.W - 2 * this.M; this.title = title;
      this.pages = []; this.images = []; this.newPage();
    }
    newPage() { this.cur = []; this.pages.push(this.cur); this.y = this.M; }
    bottom() { return this.H - this.M - 16; }
    ensure(h) { if (this.y + h > this.bottom()) { this.newPage(); return true; } return false; }
    width(s, size, bold) { const t = enc(s); let w = 0; for (let i = 0; i < t.length; i++) w += cw(t.charCodeAt(i), bold); return w * size / 1000; }
    wrap(s, size, bold, maxW) {
      const out = [];
      String(s).split('\n').forEach(par => {
        const words = par.split(/ +/); let line = '';
        words.forEach(wd => {
          const t = line ? line + ' ' + wd : wd;
          if (this.width(t, size, bold) <= maxW) { line = t; return; }
          if (line) out.push(line);
          if (this.width(wd, size, bold) <= maxW) { line = wd; return; }
          let part = ''; for (const ch of wd) { if (this.width(part + ch, size, bold) > maxW) { out.push(part); part = ch; } else part += ch; } line = part;
        });
        out.push(line);
      });
      return out;
    }
    text(x, yBase, s, size, bold, color) { this.cur.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + n2(size) + ' Tf ' + rgb(color || '#161616') + ' rg ' + n2(x) + ' ' + n2(this.H - yBase) + ' Td (' + esc(enc(s)) + ') Tj ET'); }
    rect(x, y, w, h, color) { this.cur.push(rgb(color) + ' rg ' + n2(x) + ' ' + n2(this.H - y - h) + ' ' + n2(w) + ' ' + n2(h) + ' re f'); }
    line(x1, y1, x2, y2, color, lw) { this.cur.push(rgb(color) + ' RG ' + n2(lw || 0.5) + ' w ' + n2(x1) + ' ' + n2(this.H - y1) + ' m ' + n2(x2) + ' ' + n2(this.H - y2) + ' l S'); }
    para(s, o) {
      o = o || {}; const size = o.size || 9, lh = size * 1.35, x = this.M + (o.indent || 0), w = this.CW - (o.indent || 0);
      this.wrap(s, size, o.bold, w).forEach((ln, i) => { this.ensure(lh); this.text(x, this.y + size, (i === 0 && o.bullet ? '' : '') + ln, size, o.bold, o.color); this.y += lh; });
      this.y += o.after == null ? 3 : o.after;
    }
    bullet(s, size) {
      size = size || 8.2; const lh = size * 1.35, ind = 10;
      const lines = this.wrap(s, size, false, this.CW - ind);
      lines.forEach((ln, i) => { this.ensure(lh); if (i === 0) this.text(this.M + 2, this.y + size, '·', size, true, '#525a66'); this.text(this.M + ind, this.y + size, ln, size, false, '#525a66'); this.y += lh; });
      this.y += 2;
    }
    heading(s, keep) {
      this.ensure(keep || 60); this.y += 10;
      this.text(this.M, this.y + 12, s, 12, true); this.y += 17;
      this.line(this.M, this.y, this.M + this.CW, this.y, '#161616', 1.2); this.y += 7;
    }
    kv(pairs) {
      const colW = (this.CW - 18) / 2, size = 8.4, lh = size * 1.3;
      for (let i = 0; i < pairs.length; i += 2) {
        const cells = [pairs[i], pairs[i + 1]].filter(Boolean).map(([a, b]) => ({ a: this.wrap(a, size, false, colW * 0.55 - 4), b: this.wrap(b, size, false, colW * 0.45) }));
        const h = Math.max(...cells.map(c => Math.max(c.a.length, c.b.length))) * lh + 6;
        this.ensure(h);
        cells.forEach((c, k) => {
          const x = this.M + k * (colW + 18);
          c.a.forEach((ln, j) => this.text(x, this.y + 3 + size + j * lh, ln, size, false, '#525a66'));
          c.b.forEach((ln, j) => this.text(x + colW - this.width(ln, size, false), this.y + 3 + size + j * lh, ln, size, false, '#161616'));
          this.line(x, this.y + h, x + colW, this.y + h, '#d5d9e0', 0.5);
        });
        this.y += h;
      }
      this.y += 6;
    }
    table(T, fr, o) {
      if (!T) return;
      o = o || {}; const size = o.size || 8, lh = size * 1.3, pad = 3.5;
      const ws = fr.map(f => f * this.CW);
      const xs = ws.map((w, i) => this.M + ws.slice(0, i).reduce((a, b) => a + b, 0));
      const numCol = T.head.map((h, i) => o.center ? 'c' : (T.rows[0] && T.rows[0].cells[i] && T.rows[0].cells[i].num ? 'r' : 'l'));
      const drawHead = () => {
        const hl = T.head.map((h, i) => this.wrap(h.toUpperCase(), 6.8, true, ws[i] - 2 * pad));
        const hh = Math.max(...hl.map(l => l.length)) * 8.5 + 2 * pad;
        hl.forEach((lines, i) => lines.forEach((ln, j) => {
          const w = this.width(ln, 6.8, true), x = numCol[i] === 'r' ? xs[i] + ws[i] - pad - w : numCol[i] === 'c' ? xs[i] + (ws[i] - w) / 2 : xs[i] + pad;
          this.text(x, this.y + pad + 6.8 + j * 8.5, ln, 6.8, true, '#525a66');
        }));
        this.y += hh; this.line(this.M, this.y, this.M + this.CW, this.y, '#525a66', 0.8);
      };
      this.ensure(40); drawHead();
      T.rows.forEach(rw => {
        const cells = rw.cells.map((c, i) => {
          const bold = !!c.pill || c.th;
          return { c, bold, lines: this.wrap(c.text, size, bold, ws[i] - 2 * pad) };
        });
        const h = Math.max(...cells.map(x => x.lines.length)) * lh + 2 * pad;
        if (this.ensure(h)) drawHead();
        if (rw.fail) this.rect(this.M, this.y, 2.2, h, '#da1e28');
        cells.forEach(({ c, bold, lines }, i) => {
          let col = '#161616';
          if (c.ok || c.pill === 'PASS') col = '#198038';
          if (c.bad || c.pill === 'FAIL') col = '#da1e28';
          if (c.pill === 'INFO') col = '#525a66';
          if (c.ok) this.rect(xs[i] + 0.5, this.y + 0.5, ws[i] - 1, h - 1, '#defbe6');
          if (c.bad) this.rect(xs[i] + 0.5, this.y + 0.5, ws[i] - 1, h - 1, '#fff1f1');
          if (c.nom) { this.cur.push(rgb('#0f62fe') + ' RG 1.4 w ' + n2(xs[i] + 1) + ' ' + n2(this.H - this.y - h + 1) + ' ' + n2(ws[i] - 2) + ' ' + n2(h - 2) + ' re S'); }
          lines.forEach((ln, j) => {
            const w = this.width(ln, size, bold), al = c.th && o.center ? 'c' : numCol[i];
            const x = al === 'r' ? xs[i] + ws[i] - pad - w : al === 'c' ? xs[i] + (ws[i] - w) / 2 : xs[i] + pad;
            this.text(x, this.y + pad + size + j * lh, ln, size, bold || (j === 0 && i === 0 && o.boldFirst), j > 0 && i === 0 && o.boldFirst ? '#525a66' : col);
          });
        });
        this.y += h; this.line(this.M, this.y, this.M + this.CW, this.y, '#d5d9e0', 0.4);
      });
      this.y += 8;
    }
    image(canvas, maxW) {
      const data = jpegOf(canvas);
      const id = this.images.length; this.images.push({ data, w: canvas.width, h: canvas.height });
      const w = Math.min(maxW || this.CW, this.CW), h = w * canvas.height / canvas.width;
      this.ensure(h + 4);
      this.cur.push('q ' + n2(w) + ' 0 0 ' + n2(h) + ' ' + n2(this.M) + ' ' + n2(this.H - this.y - h) + ' cm /Im' + id + ' Do Q');
      this.y += h + 4;
    }
    logo(x, y, z) { // vector version of the beamCutoff mark, z = size in pt
      const P = (px, py) => n2(x + px * z / 32) + ' ' + n2(this.H - (y + py * z / 32));
      this.cur.push(rgb('#0a0f2c') + ' rg ' + n2(x) + ' ' + n2(this.H - y - z) + ' ' + n2(z) + ' ' + n2(z) + ' re f');
      this.cur.push(rgb('#1f5fb8') + ' rg ' + P(0, 19.5) + ' m ' + P(14, 19.5) + ' l ' + P(18.5, 14.5) + ' l ' + P(32, 14.5) + ' l ' + P(32, 32) + ' l ' + P(0, 32) + ' l h f');
      this.cur.push(rgb('#3cbf8a') + ' rg ' + P(2, 21) + ' m ' + P(14.5, 21) + ' l ' + P(19, 16) + ' l ' + P(30, 16) + ' l ' + P(30, 32) + ' l ' + P(2, 32) + ' l h f');
      this.cur.push(rgb('#ffe14d') + ' rg ' + P(7, 22.5) + ' m ' + P(15, 22.5) + ' l ' + P(19.5, 17.5) + ' l ' + P(26, 17.5) + ' l ' + P(25, 29) + ' l ' + P(8, 29) + ' l h f');
      this.cur.push(rgb('#ff7eb6') + ' RG ' + n2(2.2 * z / 32) + ' w 1 J 1 j ' + P(3, 19.5) + ' m ' + P(14, 19.5) + ' l ' + P(18.5, 14.5) + ' l ' + P(29, 14.5) + ' l S');
      const r = 1.9 * z / 32, cx = x + 14 * z / 32, cy = this.H - (y + 19.5 * z / 32), k = 0.5523 * r;
      this.cur.push('1 1 1 rg ' + n2(cx + r) + ' ' + n2(cy) + ' m ' + n2(cx + r) + ' ' + n2(cy + k) + ' ' + n2(cx + k) + ' ' + n2(cy + r) + ' ' + n2(cx) + ' ' + n2(cy + r) + ' c ' + n2(cx - k) + ' ' + n2(cy + r) + ' ' + n2(cx - r) + ' ' + n2(cy + k) + ' ' + n2(cx - r) + ' ' + n2(cy) + ' c ' + n2(cx - r) + ' ' + n2(cy - k) + ' ' + n2(cx - k) + ' ' + n2(cy - r) + ' ' + n2(cx) + ' ' + n2(cy - r) + ' c ' + n2(cx + k) + ' ' + n2(cy - r) + ' ' + n2(cx + r) + ' ' + n2(cy - k) + ' ' + n2(cx + r) + ' ' + n2(cy) + ' c f');
    }
    imagesSideBySide(c1, c2) {
      const gap = 12, w = (this.CW - gap) / 2, h = Math.max(w * c1.height / c1.width, w * c2.height / c2.width);
      this.ensure(h + 4);
      [c1, c2].forEach((c, k) => {
        const data = jpegOf(c);
        const id = this.images.length; this.images.push({ data, w: c.width, h: c.height });
        const hh = w * c.height / c.width;
        this.cur.push('q ' + n2(w) + ' 0 0 ' + n2(hh) + ' ' + n2(this.M + k * (w + gap)) + ' ' + n2(this.H - this.y - hh) + ' cm /Im' + id + ' Do Q');
      });
      this.y += h + 4;
    }
    build(footerLeft) {
      const N = this.pages.length;
      this.pages.forEach((p, i) => {
        this.cur = p;
        this.line(this.M, this.H - this.M + 2, this.M + this.CW, this.H - this.M + 2, '#d5d9e0', 0.5);
        this.text(this.M, this.H - this.M + 12, footerLeft, 7, false, '#525a66');
        const t = 'Page ' + (i + 1) + ' of ' + N; this.text(this.M + this.CW - this.width(t, 7, false), this.H - this.M + 12, t, 7, false, '#525a66');
      });
      const objs = []; // strings (latin1)
      const add = (s) => { objs.push(s); return objs.length; };
      const catalog = add(null), pagesId = add(null);
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const imIds = this.images.map(im => add('<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.data.length + ' >>\nstream\n' + im.data + '\nendstream'));
      const xo = this.images.length ? ' /XObject << ' + imIds.map((id, k) => '/Im' + k + ' ' + id + ' 0 R').join(' ') + ' >>' : '';
      const kids = [];
      this.pages.forEach(p => {
        const content = p.join('\n');
        const cid = add('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
        kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + n2(this.W) + ' ' + n2(this.H) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' + xo + ' >> /Contents ' + cid + ' 0 R >>'));
      });
      objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
      objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map(k => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
      const info = add('<< /Title (' + esc(enc(this.title)) + ') /Producer (beamCutoff) /Creator (beamCutoff) >>');
      let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
      const offs = [];
      objs.forEach((s, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + s + '\nendobj\n'; });
      const xref = out.length;
      out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
      out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
      const bytes = new Uint8Array(out.length);
      for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return bytes;
    }
  }
  return { Doc, enc };
})();

function pdfReport(M, imgs) {
  const d = new PDF.Doc('Cut-off report: ' + M.file);
  d.logo(d.M, d.y, 20); d.text(d.M + 27, d.y + 14, 'beam', 11, false); d.text(d.M + 27 + d.width('beam', 11, false), d.y + 14, 'Cutoff', 11, true); d.y += 32;
  d.text(d.M, d.y + 18, 'Cut-off analysis report', 18, true); d.y += 26;
  d.para('File: ' + M.file + '   ·   generated ' + M.date + ' with beamCutoff', { size: 8.5, color: '#525a66', after: 8 });
  if (M.verdictBanner) d.para(M.verdictBanner, { size: 9, color: M.type === 'none' ? '#da1e28' : '#8e6a00', after: 6 });
  M.warnings.forEach(w => d.para('Note: ' + w, { size: 8, color: '#8e6a00', after: 2 }));
  { // verdict box
    const V = M.verdict, col = V.st === 'ok' ? '#198038' : V.st === 'bad' ? '#da1e28' : '#525a66';
    const bw = d.width(V.big, 20, true), tx = d.M + 24 + bw + 18, tw2 = d.M + d.CW - tx - 12;
    const wl = d.wrap(V.what, 8.6, false, tw2), fl = V.fails.length ? d.wrap('Failing: ' + V.fails.join(' · '), 8, true, tw2) : [];
    const h = Math.max(40, 16 + wl.length * 11.5 + fl.length * 10.5 + 6);
    d.ensure(h + 8);
    d.rect(d.M, d.y, d.CW, h, '#f2f4f8'); d.rect(d.M, d.y, 5, h, col);
    d.text(d.M + 18, d.y + h / 2 + 7, V.big, 20, true, col);
    let yy = d.y + 8 + 9; wl.forEach(ln => { d.text(tx, yy, ln, 8.6, false, '#161616'); yy += 11.5; });
    fl.forEach(ln => { d.text(tx, yy, ln, 8, true, '#da1e28'); yy += 10.5; });
    d.y += h + 6;
  }
  // summary tiles as a 3-column grid
  const cols = 3, gap = 1, tw = (d.CW - gap * (cols - 1)) / cols;
  for (let i = 0; i < M.tiles.length; i += cols) {
    const row = M.tiles.slice(i, i + cols);
    const hs = row.map(t => { const v = d.wrap(t.v, 12, true, tw - 16), s = d.wrap(t.s, 7.6, false, tw - 16); return { v, s, h: 10 + 9 + v.length * 14 + s.length * 9.5 + 8 }; });
    const h = Math.max(...hs.map(x => x.h));
    d.ensure(h + 2);
    row.forEach((t, k) => {
      const x = d.M + k * (tw + gap);
      d.rect(x, d.y, tw, h, '#f2f4f8');
      if (t.st) d.rect(x, d.y, 3, h, t.st === 'ok' ? '#198038' : '#da1e28');
      let yy = d.y + 15;
      d.text(x + 10, yy, t.k.toUpperCase(), 6.6, true, '#525a66'); yy += 15;
      hs[k].v.forEach(ln => { d.text(x + 10, yy, ln, 12, true); yy += 14; });
      hs[k].s.forEach(ln => { d.text(x + 10, yy - 2, ln, 7.6, false, '#525a66'); yy += 9.5; });
    });
    d.y += h + gap;
  }
  d.y += 4;
  d.heading('Settings'); d.kv(M.settings);
  if (imgs.map) {
    d.heading('Candela map', 330); d.image(imgs.map);
    d.para(MAP_CAPTION, { size: 7.4, color: '#525a66', after: 6 });
    d.heading('Vertical scans and cut-off line', 240); d.imagesSideBySide(imgs.vscan, imgs.cline);
    d.para('Left: log I (solid) and G (dashed) at 1.5°, 2.5°, 3.5° on the horizontal part. Right: inflection position per vertical scan, dashed grey G. File angles.', { size: 7.4, color: '#525a66', after: 6 });
  }
  if (M.cut) { d.heading('Cut-off quality and aiming (Annex 6)'); d.table(M.cut, [0.44, 0.15, 0.14, 0.17, 0.10]); d.kv(M.kink); }
  if (M.reg) {
    d.heading(M.regTitle); d.para(M.regSub, { size: 8, color: '#525a66', after: 4 });
    d.table(M.reg, [0.25, 0.22, 0.14, 0.17, 0.12, 0.10], { boldFirst: true, size: 7.6 });
  }
  if (M.robust) {
    d.heading('Aim robustness');
    d.para('Failing photometric items when the aimed beam is moved away from nominal. Outlined cell: nominal aim.', { size: 8, color: '#525a66', after: 4 });
    d.table(M.robust, [0.2, 0.16, 0.16, 0.16, 0.16, 0.16], { center: true });
  }
  d.heading('Additional beam data'); d.kv(M.extra);
  if (M.ranges) d.table(M.ranges, [0.6, 0.2, 0.2]);
  d.heading('File'); d.kv(M.fileKv);
  d.heading('Method'); M.notes.forEach(n => d.bullet(n));
  return d.build('beamCutoff · UN R149 (00 series) Class C · ' + M.file.slice(0, 70));
}

/* ----- saving ----- */
let framed = true; try { framed = window.self !== window.top; } catch (e) { framed = true; }
let dlNs;
async function downloadsNs() {
  if (dlNs !== undefined) return dlNs;
  try { dlNs = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null; } catch (e) { dlNs = null; }
  return dlNs;
}
function say(t) { $('copyStatus').textContent = t; toast(t); }
async function saveFile(name, data, mime) {
  if (!framed) {
    const blob = new Blob([data], { type: mime }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    say('Saved ' + name + '.'); return;
  }
  const ns = await downloadsNs();
  if (!ns) { say('Downloads are not available in this view. Open the tool on GitHub Pages to save the file.'); return; }
  try { await ns.save({ filename: name, data: new Blob([data], { type: mime }) }); say('Saved ' + name + '.'); }
  catch (e) { say(e && e.code === 'declined' ? 'Download cancelled.' : 'Could not save the file' + (e && e.message ? ': ' + e.message : '.')); }
}
async function makeReport(kind) {
  if (!state.res) { say('Load an IES file first.'); return; }
  say('Building the ' + kind.toUpperCase() + ' report…');
  await new Promise(r => setTimeout(r, 20));
  try {
    const M = buildModel(), imgs = captureCharts();
    if (kind === 'pdf') await saveFile(baseName() + '_cutoff_report.pdf', pdfReport(M, imgs), 'application/pdf');
    else await saveFile(baseName() + '_cutoff_report.html', htmlReport(M, imgs), 'text/html');
  } catch (e) { console.error(e); say('Report failed: ' + e.message); }
}
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); say(label + ' copied to the clipboard.'); }
  catch (e) { say('The browser blocked clipboard access.'); }
}
$('btnPdf').addEventListener('click', () => makeReport('pdf'));
$('btnHtml').addEventListener('click', () => makeReport('html'));
$('btnCsv').addEventListener('click', () => { if (state.res) saveFile(baseName() + '_cutoff.csv', csvReport(), 'text/csv'); });
$('btnJson').addEventListener('click', () => copy(jsonReport(), 'JSON report'));
window.__bcReport = { buildModel, captureCharts, htmlReport, pdfReport };
