/* beamCutoff core — IES parsing, cut-off analysis, UN R149 passing-beam check.
 * Pure functions, no DOM. Works in browser (window.BCCore) and Node (module.exports).
 * Coordinate convention: H positive = right, V positive = up, degrees, 0/0 = lamp axis (HV).
 */
(function (root) {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const log10 = Math.log10;

  /* ------------------------------------------------------------------ */
  /* IES LM-63 parser                                                    */
  /* ------------------------------------------------------------------ */
  function parseIES(text) {
    const lines = text.split(/\r?\n/);
    const keywords = {};
    let tiltIdx = -1;
    const firstLine = (lines[0] || '').trim();
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i].trim();
      const m = ln.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (m) {
        const k = m[1].toUpperCase();
        keywords[k] = keywords[k] ? keywords[k] + ' ' + m[2] : m[2];
      }
      if (/^TILT\s*=/i.test(ln)) { tiltIdx = i; break; }
    }
    if (tiltIdx < 0) throw new Error('No "TILT=" line found. This does not look like an IES LM-63 file.');
    const tilt = lines[tiltIdx].split('=').slice(1).join('=').trim().toUpperCase();
    const tok = lines.slice(tiltIdx + 1).join(' ').trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let p = 0;
    if (tilt === 'INCLUDE') { p++; const n = tok[p++]; p += 2 * n; }
    const need = (k) => { if (p + k > tok.length) throw new Error('IES file is truncated (not enough numeric values).'); };
    need(13);
    const hdr = {
      nLamps: tok[p++], lumensPerLamp: tok[p++], multiplier: tok[p++],
      nV: Math.round(tok[p++]), nH: Math.round(tok[p++]), photType: Math.round(tok[p++]),
      units: tok[p++], width: tok[p++], length: tok[p++], height: tok[p++],
      ballast: tok[p++], futureUse: tok[p++], watts: tok[p++]
    };
    const { nV, nH } = hdr;
    if (!(nV > 1 && nH > 0)) throw new Error('Invalid number of angles in IES header.');
    need(nV + nH + nV * nH);
    const vAng = Float64Array.from(tok.slice(p, p + nV)); p += nV;
    const hAng = Float64Array.from(tok.slice(p, p + nH)); p += nH;
    const cd = Float64Array.from(tok.slice(p, p + nV * nH)); p += nV * nH;
    for (let i = 0; i < cd.length; i++) if (!isFinite(cd[i])) throw new Error('Non-numeric candela value in file.');
    return { format: firstLine, keywords, tilt, hdr, vAng, hAng, cd };
  }

  /* Build an H/V grid (H right+, V up+) from a parsed file. */
  function buildGrid(ies, opt) {
    opt = opt || {};
    const { hdr, vAng, hAng, cd } = ies;
    const scale = (hdr.multiplier || 1) * (opt.applyBallast === false ? 1 : (hdr.ballast || 1));
    const notes = [];
    let cols = []; // {h, vals: Float64Array over V}
    let V;
    const nV = vAng.length;
    const colOf = (j) => { const a = new Float64Array(nV); for (let i = 0; i < nV; i++) a[i] = cd[j * nV + i] * scale; return a; };

    if (hdr.photType === 1) { // Type C : C-planes about vertical axis, gamma from nadir
      notes.push('Type C file mapped to H/V: H = C-plane angle (−180…180), V = γ − 90°.');
      let planes = [];
      for (let j = 0; j < hAng.length; j++) planes.push({ c: hAng[j], vals: colOf(j) });
      const cmax = Math.max(...hAng), cmin = Math.min(...hAng);
      if (hAng.length === 1) { planes.push({ c: 180, vals: planes[0].vals }); planes.push({ c: 360, vals: planes[0].vals }); notes.push('Rotationally symmetric Type C file.'); }
      else if (cmin === 0 && cmax <= 90) {
        const ext = [];
        planes.forEach(pl => { ext.push({ c: 180 - pl.c, vals: pl.vals }, { c: 180 + pl.c, vals: pl.vals }, { c: 360 - pl.c, vals: pl.vals }); });
        planes = planes.concat(ext); notes.push('Quadrant-symmetric Type C file expanded to 360°.');
      } else if (cmin === 0 && cmax <= 180) {
        planes = planes.concat(planes.map(pl => ({ c: 360 - pl.c, vals: pl.vals }))); notes.push('Bilaterally symmetric Type C file mirrored to 360°.');
      }
      const map = new Map();
      planes.forEach(pl => { let h = ((pl.c % 360) + 360) % 360; if (h > 180) h -= 360; const k = Math.round(h * 1e6) / 1e6; if (!map.has(k)) map.set(k, pl.vals); });
      cols = [...map.entries()].map(([h, vals]) => ({ h, vals }));
      if (map.has(180) && !map.has(-180)) cols.push({ h: -180, vals: map.get(180) });
      V = Array.from(vAng, g => g - 90);
    } else { // Type A / B : H-V photometry (taken directly as screen angles)
      if (hdr.photType !== 2 && hdr.photType !== 3) notes.push('Unknown photometric type ' + hdr.photType + ' — treated as H-V (Type B).');
      for (let j = 0; j < hAng.length; j++) cols.push({ h: hAng[j], vals: colOf(j) });
      const hmin = Math.min(...hAng);
      if (hmin >= 0 && hAng.length > 1) {
        const mir = cols.filter(c => c.h > 0).map(c => ({ h: -c.h, vals: c.vals }));
        cols = cols.concat(mir);
        notes.push('File covers only H ≥ 0 — mirrored to H < 0 (symmetric assumption). A low beam is normally NOT symmetric: check the file.');
      }
      V = Array.from(vAng);
    }
    // sort V ascending
    let vIdx = V.map((v, i) => i).sort((a, b) => V[a] - V[b]);
    // sort columns by H
    cols.sort((a, b) => a.h - b.h);
    // dedupe H
    cols = cols.filter((c, i) => i === 0 || Math.abs(c.h - cols[i - 1].h) > 1e-9);
    let Hs = cols.map(c => c.h);
    let Vs = vIdx.map(i => V[i]);
    if (opt.flipV) { Vs = Vs.map(v => -v).reverse(); vIdx = vIdx.slice().reverse(); notes.push('V axis flipped (file had V positive downward).'); }
    if (opt.flipH) { Hs = Hs.map(h => -h).reverse(); cols = cols.slice().reverse(); notes.push('H axis mirrored.'); }
    const nH = Hs.length, nVs = Vs.length;
    const I = new Float64Array(nH * nVs);
    let Imax = 0, iMaxH = 0, iMaxV = 0;
    for (let j = 0; j < nH; j++) {
      const vals = cols[j].vals;
      for (let i = 0; i < nVs; i++) {
        const x = Math.max(0, vals[vIdx[i]]);
        I[j * nVs + i] = x;
        if (x > Imax) { Imax = x; iMaxH = j; iMaxV = i; }
      }
    }
    const res = (a) => { let m = Infinity; for (let i = 1; i < a.length; i++) m = Math.min(m, a[i] - a[i - 1]); return m; };
    return {
      H: Float64Array.from(Hs), V: Float64Array.from(Vs), I, nH, nV: nVs,
      Imax, ImaxAt: { h: Hs[iMaxH], v: Vs[iMaxV] },
      hRes: res(Hs), vRes: res(Vs), notes
    };
  }

  /* ------------------------------------------------------------------ */
  /* Sampling                                                            */
  /* ------------------------------------------------------------------ */
  function axisLocator(A) {
    const n = A.length, a0 = A[0], step = (A[n - 1] - a0) / (n - 1);
    let uniform = true;
    for (let i = 1; i < n; i++) if (Math.abs(A[i] - a0 - i * step) > 1e-6 * Math.max(1, Math.abs(step))) { uniform = false; break; }
    return function (x) { // returns [i0, t] or null
      if (x < A[0] - 1e-9 || x > A[n - 1] + 1e-9) return null;
      let i;
      if (uniform) { i = Math.floor((x - a0) / step); }
      else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= x) lo = m; else hi = m; } i = lo; }
      if (i < 0) i = 0; if (i > n - 2) i = n - 2;
      let t = (x - A[i]) / (A[i + 1] - A[i]); if (t < 0) t = 0; if (t > 1) t = 1;
      return [i, t];
    };
  }

  function makeSampler(g) {
    const lh = axisLocator(g.H), lv = axisLocator(g.V), nV = g.nV, I = g.I;
    return function (h, v) {
      const a = lh(h); if (!a) return 0; const b = lv(v); if (!b) return 0;
      const j = a[0], tj = a[1], i = b[0], ti = b[1];
      const k = j * nV + i;
      const i00 = I[k], i01 = I[k + 1], i10 = I[k + nV], i11 = I[k + nV + 1];
      return (1 - tj) * ((1 - ti) * i00 + ti * i01) + tj * ((1 - ti) * i10 + ti * i11);
    };
  }

  /* transform: canonical/aimed frame -> raw.  mirror m=±1, shifts dh,dv applied to the beam */
  function transformed(f, m, dh, dv) { return (h, v) => f(m * (h - dh), v - dv); }

  /* detector aperture (disc average) — angular diameter in degrees */
  function withAperture(f, diam) {
    if (!diam) return f;
    const r = diam / 2, pts = [[0, 0, 1]];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; pts.push([0.5 * r * Math.cos(a), 0.5 * r * Math.sin(a), 1]); }
    for (let k = 0; k < 12; k++) { const a = (k + 0.5) * Math.PI / 6; pts.push([0.9 * r * Math.cos(a), 0.9 * r * Math.sin(a), 1]); }
    const wsum = pts.length;
    return (h, v) => { let s = 0; for (const p of pts) s += f(h + p[0], v + p[1]); return s / wsum; };
  }

  /* ------------------------------------------------------------------ */
  /* Scans & gradient (R149 Annex 6 style: G = log I(β) − log I(β+0.1°)) */
  /* ------------------------------------------------------------------ */
  // vertical scan at fixed h. Gradient positive where it is brighter BELOW.
  function vscan(f, h, v0, v1, floorCd, step) {
    step = step || 0.01;
    const n = Math.max(3, Math.round((v1 - v0) / step) + 1);
    const vs = new Float64Array(n), Is = new Float64Array(n), L = new Float64Array(n);
    let imax = 0;
    for (let k = 0; k < n; k++) { const v = v0 + k * step; vs[k] = v; const x = f(h, v); Is[k] = x; if (x > imax) imax = x; L[k] = log10(Math.max(x, floorCd)); }
    const half = Math.round(0.05 / step), below = Math.round(0.3 / step);
    const G = new Float64Array(n).fill(NaN);
    let best = -1, bestG = -Infinity;
    for (let k = half; k < n - half; k++) {
      const g = L[k - half] - L[k + half];
      G[k] = g;
      const kb = Math.max(0, k - below);
      if (Is[kb] < 0.05 * imax) continue; // must have a bright zone below the transition
      if (g > bestG) { bestG = g; best = k; }
    }
    if (best < 0) return { v: NaN, G: 0, vs, Is, Gs: G, peaks: [] };
    let vPk = vs[best];
    if (best > half && best < n - half - 1) { // parabolic refinement
      const a = G[best - 1], b = G[best], c = G[best + 1], den = a - 2 * b + c;
      if (den < 0) vPk += step * 0.5 * (a - c) / den;
    }
    // secondary peaks (for "only one cut-off" check)
    const peaks = [];
    for (let k = half + 1; k < n - half - 1; k++) {
      if (!(G[k] >= 0.08 && G[k] >= G[k - 1] && G[k] > G[k + 1])) continue;
      const kb = Math.max(0, k - below); if (Is[kb] < 0.05 * imax) continue;
      peaks.push({ v: vs[k], G: G[k] });
    }
    // merge peaks closer than 0.3°
    const merged = [];
    peaks.sort((a, b) => b.G - a.G).forEach(p => { if (!merged.some(q => Math.abs(q.v - p.v) < 0.3)) merged.push(p); });
    return { v: vPk, G: bestG, vs, Is, Gs: G, peaks: merged };
  }
  // horizontal scan at fixed v. Gradient positive where it is brighter to the RIGHT.
  function hscan(f, v, h0, h1, floorCd, step) {
    step = step || 0.01;
    const n = Math.max(3, Math.round((h1 - h0) / step) + 1);
    const hs = new Float64Array(n), Is = new Float64Array(n), L = new Float64Array(n);
    let imax = 0;
    for (let k = 0; k < n; k++) { const h = h0 + k * step; hs[k] = h; const x = f(h, v); Is[k] = x; if (x > imax) imax = x; L[k] = log10(Math.max(x, floorCd)); }
    const half = Math.round(0.05 / step), side = Math.round(0.3 / step);
    const G = new Float64Array(n).fill(NaN);
    let best = -1, bestG = -Infinity;
    for (let k = half; k < n - half; k++) {
      const g = L[k + half] - L[k - half]; G[k] = g;
      const kr = Math.min(n - 1, k + side); if (Is[kr] < 0.05 * imax) continue;
      if (g > bestG) { bestG = g; best = k; }
    }
    if (best < 0) return { h: NaN, G: 0, hs, Is, Gs: G };
    let hPk = hs[best];
    if (best > half && best < n - half - 1) { const a = G[best - 1], b = G[best], c = G[best + 1], den = a - 2 * b + c; if (den < 0) hPk += step * 0.5 * (a - c) / den; }
    return { h: hPk, G: bestG, hs, Is, Gs: G };
  }

  function median(a) { const b = a.filter(x => isFinite(x)).sort((x, y) => x - y); if (!b.length) return NaN; const m = b.length >> 1; return b.length % 2 ? b[m] : 0.5 * (b[m - 1] + b[m]); }

  function cutoffLine(f, h0, h1, step, win, floorCd) {
    const out = [];
    for (let h = h0; h <= h1 + 1e-9; h += step) {
      const s = vscan(f, +h.toFixed(4), win[0], win[1], floorCd, 0.01);
      out.push({ h: +h.toFixed(4), v: s.v, G: s.G });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* UN R149 (00 series) passing-beam requirements — asymmetric, RHT     */
  /* Table 9 (Class C), Table 10 (Imax segment / cut-off),               */
  /* Table 11 (Zone III). Values in cd. For LHT, L and R are swapped.    */
  /* ------------------------------------------------------------------ */
  const ZONE_IIIa = [[-8, 1], [-8, 4], [8, 4], [8, 2], [6, 1.5], [1.5, 1.5], [0, 0], [-4, 0]];
  const ZONE_1 = [[-8, 1], [-8, 4], [8, 4], [8, 1], [4, 0], [1, 0], [0, 0.6], [-1, 0], [-4, 0]]; // symmetrical beams

  function classTable(cls) {
    // helper constructors
    const P = (id, h, v, min, max, note) => ({ id, kind: 'point', h, v, min, max, note });
    const S = (id, pts, min, note) => ({ id, kind: 'sum', pts, min, note });
    const HS = (id, v, h1, h2, min, max, mode, note) => ({ id, kind: 'hseg', v, h1, h2, min, max, mode, note });
    const RG = (id, h1, h2, v1, v2, min, max, note) => ({ id, kind: 'rect', h1, h2, v1, v2, min, max, note });
    const BL = (id, v, h1, h2, max, note) => ({ id, kind: 'below', v, h1, h2, max, note });
    const ZN = (id, poly, max, note) => ({ id, kind: 'zone', poly, max, note });
    const S50 = [[-8, 4], [0, 4], [8, 4]], S100 = [[-4, 2], [0, 2], [4, 2]];
    const pos = 'one pair of position lamps may be switched on (applicant\'s choice)';
    const side50 = 'min 50 cd = contribution of each side (Annex 4)';
    const n50L = 'max may be ×1.4 if declared by the applicant';
    const t = {
      C: [
        P('B50L', -3.43, 0.57, 50, 350, side50),
        P('BR', 2.5, 1.0, 50, 1750, side50),
        HS('Segment BRR', 0.57, 8, 20, 50, 3550, 'atLeastOne', 'min 50 cd at ≥1 point of the segment'),
        HS('Segment BLL', 0.57, -20, -8, 50, 625, 'atLeastOne', 'min 50 cd at ≥1 point of the segment'),
        P('P', -7, 0, 63, null),
        ZN('Zone III', ZONE_IIIa, 625),
        S('S50+S50LL+S50RR', S50, 190, pos),
        S('S100+S100LL+S100RR', S100, 375, pos),
        P('75R', 1.15, -0.57, 10100, null),
        P('50V', 0, -0.86, 5100, null),
        P('50L', -3.43, -0.86, 3550, 13200, n50L),
        P('25LL', -16, -1.72, 1180, null),
        P('25RR', 11, -1.72, 1180, null),
        BL('Segment 10 and below', -4, -4.5, 2, 12300),
        RG('Imax', -0.5, 3, -1.72, -0.3, 16900, 44100, 'Segment Imax 0.5L–3R / 0.3D–1.72D')
      ]
    };
    // Symmetrical passing beam, Classes CS and DS (UN R149 00 series, Table 35)
    const posS = 'position lamp(s) may be switched on (applicant\'s choice)';
    const sym = (ds) => [
      ZN('Zone 1', ZONE_1, 900),
      RG('Zone 2', -8, 8, 4.05, 15, null, 700, 'above 4°U up to 15°U, 8°L…8°R'),
      P('Point 8 (4°U 8°L)', -8, 4, null, 700),
      P('Point 9 (4°U V)', 0, 4, null, 700),
      P('Point 10 (4°U 8°R)', 8, 4, null, 700),
      S('Points 8+9+10', [[-8, 4], [0, 4], [8, 4]], 150, posS),
      P('Point 11 (2°U 4°L)', -4, 2, null, 900),
      P('Point 12 (2°U V)', 0, 2, null, 900),
      P('Point 13 (2°U 4°R)', 4, 2, null, 900),
      S('Points 11+12+13', [[-4, 2], [0, 2], [4, 2]], 300, posS),
      P('Point 4 (1.5°L)', -1.5, 0.5, null, 900),
      P('Point 4 (1.5°R)', 1.5, 0.5, null, 900),
      P('Point 14 (8°L)', -8, 0, 50, null, posS),
      P('Point 14 (8°R)', 8, 0, 50, null, posS),
      P('Point 15 (4°L)', -4, 0, 100, 900, posS),
      P('Point 15 (4°R)', 4, 0, 100, 900, posS),
      P('Point 7 (HV)', 0, 0, null, 1700),
      P('Point 1 (3.5°R)', 3.5, -0.86, 2000, 13750),
      P('Point 2 (V)', 0, -0.86, ds ? 4900 : 2450, null, 'matched pair: each lamp at least 50 % of the minimum'),
      P('Point 3 (3.5°L)', -3.5, -0.86, 2000, 13750),
      HS('Line 1', -2, -9, 9, 1350, null, 'all', 'every point 9°L…9°R'),
      P('Point 5 (15°L)', -15, -2, ds ? 1100 : 550, null),
      P('Point 5 (15°R)', 15, -2, ds ? 1100 : 550, null),
      P('Point 6 (20°L)', -20, -4, ds ? 300 : 150, null),
      P('Point 6 (20°R)', 20, -4, ds ? 300 : 150, null)
    ];
    t.CS = sym(false); t.DS = sym(true);
    return t[cls];
  }
  // allowed aimed position of the horizontal cut-off, degrees (negative = down)
  const CUTOFF_RANGE = { C: [-0.57, -0.57], CS: [-0.57, -0.57], DS: [-0.57, -0.57] };
  const SYM_CLASSES = ['CS', 'DS'];

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      // on-edge test (inclusive boundary)
      const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
      if (Math.abs(cross) < 1e-9 && x >= Math.min(xi, xj) - 1e-9 && x <= Math.max(xi, xj) + 1e-9 && y >= Math.min(yi, yj) - 1e-9 && y <= Math.max(yi, yj) + 1e-9) return true;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  function evalElement(el, f, vBottom) {
    const st = 0.05;
    let value, at = null, minV, maxV, minAt, maxAt;
    const scanArea = (h1, h2, v1, v2, test) => {
      maxV = -Infinity; minV = Infinity;
      for (let h = h1; h <= h2 + 1e-9; h += st) for (let v = v1; v <= v2 + 1e-9; v += st) {
        if (test && !test(h, v)) continue;
        const x = f(h, v);
        if (x > maxV) { maxV = x; maxAt = { h, v }; }
        if (x < minV) { minV = x; minAt = { h, v }; }
      }
    };
    switch (el.kind) {
      case 'point': value = f(el.h, el.v); at = { h: el.h, v: el.v }; break;
      case 'sum': value = el.pts.reduce((s, p) => s + f(p[0], p[1]), 0); el.parts = el.pts.map(p => f(p[0], p[1])); break;
      case 'hseg': scanArea(el.h1, el.h2, el.v, el.v); break;
      case 'rect': scanArea(el.h1, el.h2, el.v1, el.v2); value = maxV; at = maxAt; break;
      case 'below': scanArea(el.h1, el.h2, Math.min(el.v, vBottom), el.v); value = maxV; at = maxAt; break;
      case 'zone': {
        const xs = el.poly.map(p => p[0]), ys = el.poly.map(p => p[1]);
        scanArea(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), (h, v) => pointInPoly(h, v, el.poly));
        value = maxV; at = maxAt; break;
      }
    }
    let pass = true, margin = Infinity, limitTxt = [];
    const chkMin = (val, lim) => { if (val < lim) pass = false; margin = Math.min(margin, (val - lim) / lim); };
    const chkMax = (val, lim) => { if (val > lim) pass = false; margin = Math.min(margin, (lim - val) / lim); };
    if (el.kind === 'hseg') {
      if (el.max != null) chkMax(maxV, el.max);
      if (el.min != null) chkMin(el.mode === 'atLeastOne' ? maxV : minV, el.min);
      value = el.max != null ? maxV : minV; at = el.max != null ? maxAt : minAt;
      el._minV = minV; el._maxV = maxV;
    } else {
      if (el.min != null) chkMin(value, el.min);
      if (el.max != null) chkMax(value, el.max);
    }
    if (el.min != null) limitTxt.push('≥ ' + el.min);
    if (el.max != null) limitTxt.push('≤ ' + el.max);
    return { id: el.id, kind: el.kind, value, at, pass, margin, min: el.min, max: el.max, note: el.note || '', segMin: minV, segMax: maxV, parts: el.parts };
  }

  function location(el) {
    const fh = (h) => h === 0 ? 'V' : Math.abs(h).toFixed(2) + (h < 0 ? 'L' : 'R');
    const fv = (v) => v === 0 ? 'H' : Math.abs(v).toFixed(2) + (v < 0 ? 'D' : 'U');
    switch (el.kind) {
      case 'point': return fv(el.v) + ', ' + fh(el.h);
      case 'sum': return el.pts.map(p => fv(p[1]) + ' ' + fh(p[0])).join(' + ');
      case 'hseg': return fv(el.v) + ', ' + fh(el.h1) + ' … ' + fh(el.h2);
      case 'rect': return fv(el.v2) + '…' + fv(el.v1) + ', ' + fh(el.h1) + '…' + fh(el.h2);
      case 'below': return fv(el.v) + ' and below, ' + fh(el.h1) + '…' + fh(el.h2);
      case 'zone': return el.id === 'Zone 1' ? 'polygon (Table 35)' : 'polygon (Table 11)';
    }
  }

  function regulationCheck(fa, cls, vBottom) {
    const table = classTable(cls);
    return table.map(el => Object.assign(evalElement(el, fa, vBottom), { loc: location(el), def: el }));
  }

  /* ------------------------------------------------------------------ */
  /* Flux                                                                */
  /* ------------------------------------------------------------------ */
  function fluxWeights(g) { // az/el: dΩ = cosV dH dV  (exact band integration in V)
    const { H, V, nH, nV } = g;
    const wh = new Float64Array(nH), wv = new Float64Array(nV);
    for (let j = 0; j < nH; j++) { const a = j > 0 ? (H[j] - H[j - 1]) / 2 : 0, b = j < nH - 1 ? (H[j + 1] - H[j]) / 2 : 0; wh[j] = (a + b) * D2R; }
    for (let i = 0; i < nV; i++) {
      const lo = i > 0 ? (V[i] + V[i - 1]) / 2 : V[i], hi = i < nV - 1 ? (V[i] + V[i + 1]) / 2 : V[i];
      wv[i] = Math.sin(Math.max(-90, Math.min(90, hi)) * D2R) - Math.sin(Math.max(-90, Math.min(90, lo)) * D2R);
    }
    return { wh, wv };
  }
  function flux(g, dv) {
    const { wh, wv } = fluxWeights(g);
    let tot = 0, above = 0, inZone = 0;
    for (let j = 0; j < g.nH; j++) for (let i = 0; i < g.nV; i++) {
      const phi = g.I[j * g.nV + i] * wh[j] * wv[i];
      tot += phi; const v = g.V[i] + dv, h = g.H[j];
      if (v > 0) above += phi;
      if (Math.abs(h) <= 30 && v <= 1 && v >= -15) inZone += phi;
    }
    return { total: tot, aboveHH: above, zone30x15: inZone };
  }

  /* ------------------------------------------------------------------ */
  /* Main analysis                                                       */
  /* ------------------------------------------------------------------ */
  const APERTURE = { none: 0, '10m': 2 * Math.atan(0.005 / 10) * R2D, '25m': 2 * Math.atan(0.015 / 25) * R2D };

  function fitHonV(pts) { // h = c + d v (least squares)
    const n = pts.length; let sv = 0, sh = 0, svv = 0, svh = 0;
    pts.forEach(p => { sv += p.v; sh += p.h; svv += p.v * p.v; svh += p.v * p.h; });
    const den = n * svv - sv * sv; if (Math.abs(den) < 1e-12) return null;
    const d = (n * svh - sv * sh) / den, c = (sh - d * sv) / n; return { c, d };
  }

  function analyse(g, o) {
    o = Object.assign({ traffic: 'auto', hMethod: 'geom', aimMode: 'full', target: -0.57, cls: 'C', detector: 'none', mountH: 0.65, dvExtra: 0, dhExtra: 0 }, o || {});
    const f0 = makeSampler(g);
    const fRaw = withAperture(f0, APERTURE[o.detector] || 0);
    const floorCd = Math.max(1, 1e-4 * g.Imax);
    const vMin = g.V[0], vMax = g.V[g.nV - 1];
    const win = [Math.max(vMin + 0.1, -6), Math.min(vMax - 0.1, 4)];
    const warnings = [];
    if (g.vRes > 0.1 + 1e-9) warnings.push('Vertical resolution is ' + g.vRes.toFixed(3) + '° (> 0.1°). The gradient G is under-estimated on coarse grids; use ≤ 0.05° for a reliable sharpness value.');
    if (g.H[0] > -20 || g.H[g.nH - 1] < 20) warnings.push('H range is ' + g.H[0] + '…' + g.H[g.nH - 1] + '°. R149 test points need at least ±20° (BLL/BRR, 25LL).');
    if (vMin > -4 || vMax < 4) warnings.push('V range is ' + vMin + '…' + vMax + '°. R149 test points need at least 4°D…4°U.');

    // 1. raw cut-off line (as measured)
    const rawLine = cutoffLine(fRaw, -10, 10, 0.1, win, floorCd);
    const sel = (a, b) => rawLine.filter(p => p.h >= a - 1e-9 && p.h <= b + 1e-9 && p.G >= 0.08);
    const left = sel(-4, -1.5), right = sel(1.5, 4);
    const vLeft = median(left.map(p => p.v)), vRight = median(right.map(p => p.v));
    const sL = vscan(fRaw, -2.5, win[0], win[1], floorCd), sR = vscan(fRaw, 2.5, win[0], win[1], floorCd);
    let type, traffic = null, kinkDir = null;
    const sharpL = left.length >= 6, sharpR = right.length >= 6;
    let delta = vRight - vLeft;
    if (!sharpL && !sharpR) type = 'none';
    else if (sharpL && sharpR) {
      if (delta > 0.25) { type = 'asym'; traffic = 'RHT'; }
      else if (delta < -0.25) { type = 'asym'; traffic = 'LHT'; }
      else type = 'sym';
    } else { type = 'asym'; traffic = sharpL ? 'RHT' : 'LHT'; }
    const detectedTraffic = traffic;
    let cls = o.cls || 'auto';
    if (cls === 'auto') cls = type === 'sym' ? 'CS' : 'C';
    const symCls = SYM_CLASSES.includes(cls);
    if (o.traffic !== 'auto' && type !== 'none') { if (type === 'asym' || o.forceAsym) traffic = o.traffic; }
    if (o.traffic !== 'auto' && type === 'asym' && detectedTraffic && o.traffic !== detectedTraffic) warnings.push('Traffic side forced to ' + o.traffic + ' although the cut-off shape indicates ' + detectedTraffic + '.');

    const res = {
      type, traffic, detectedTraffic, cls, symClass: symCls, rawLine, vLeftRaw: vLeft, vRightRaw: vRight, deltaRaw: delta, warnings,
      scansRaw: { L: sL, R: sR }, floorCd, options: o, grid: { H0: g.H[0], H1: g.H[g.nH - 1], V0: vMin, V1: vMax, hRes: g.hRes, vRes: g.vRes, nH: g.nH, nV: g.nV, Imax: g.Imax, ImaxAt: g.ImaxAt }
    };
    res.fluxRaw = flux(g, 0);
    if (type === 'none') {
      res.verdict = 'No distinct cut-off found (G < 0.08 on both sides). The file looks like a driving (high) beam or a beam without cut-off; low-beam cut-off analysis is not applicable.';
      return res;
    }

    if (symCls && type === 'asym') warnings.push('Class ' + cls + ' is for symmetrical passing beams, but this cut-off has a kink (' + traffic + '). It was checked with the symmetrical procedure anyway.');
    if (symCls && vMax < 15) warnings.push('V range ends at ' + vMax + '°U. Zone 2 of Class ' + cls + ' reaches 15°U; the part outside the file is treated as 0 cd.');
    res.hasKink = type === 'asym' && !symCls;

    // 2. canonical frame (RHT): mirror LHT files (not for symmetrical classes)
    const m = traffic === 'LHT' && !symCls ? -1 : 1;
    res.mirror = m;
    const fc = transformed(fRaw, m, 0, 0);
    const fcNoAp = transformed(f0, m, 0, 0);

    // horizontal-part scans at 1.5/2.5/3.5 (L in canonical frame). For symmetric beams also R side.
    const s25 = vscan(fc, -2.5, win[0], win[1], floorCd), s15 = vscan(fc, -1.5, win[0], win[1], floorCd), s35 = vscan(fc, -3.5, win[0], win[1], floorCd);
    let vCut = s25.v;
    res.cutRef = (m === -1 ? '2.5°R' : '2.5°L');
    if (symCls) { // symmetrical procedure: inflection on V-V is the aiming reference
      const sV = vscan(fc, 0, win[0], win[1], floorCd), s3L = vscan(fc, -3, win[0], win[1], floorCd), s3R = vscan(fc, 3, win[0], win[1], floorCd);
      res.scanV = sV; res.scan3L = s3L; res.scan3R = s3R;
      if (isFinite(sV.v) && sV.G >= 0.05) { vCut = sV.v; res.cutRef = 'V-V'; }
      else { warnings.push('No clear cut-off on V-V; the 2.5°L scan was used for vertical aim.'); }
    }
    res.scan25 = s25; res.scan15 = s15; res.scan35 = s35;
    const infl = [s15.v, s25.v, s35.v];
    res.linearity = Math.max(...infl) - Math.min(...infl);
    res.G25 = s25.G;
    // sharpness with the regulation's detector apertures (Annex 6 §2): 10 m / Ø10 mm and 25 m / Ø30 mm
    const sideX = -2.5;
    res.G_10m = vscan(transformed(withAperture(f0, APERTURE['10m']), m, 0, 0), sideX, win[0], win[1], floorCd, 0.01).G;
    res.G_25m = vscan(transformed(withAperture(f0, APERTURE['25m']), m, 0, 0), sideX, win[0], win[1], floorCd, 0.01).G;
    res.G_grid = vscan(fcNoAp, sideX, win[0], win[1], floorCd, 0.01).G;
    res.nCutoffs = s25.peaks.length;
    if (type === 'sym' || symCls) {
      const s25r = vscan(fc, 2.5, win[0], win[1], floorCd);
      res.scan25R = s25r; res.G25R = s25r.G;
      res.G_10mR = vscan(transformed(withAperture(f0, APERTURE['10m']), m, 0, 0), 2.5, win[0], win[1], floorCd, 0.01).G;
      res.G_25mR = vscan(transformed(withAperture(f0, APERTURE['25m']), m, 0, 0), 2.5, win[0], win[1], floorCd, 0.01).G;
      res.nCutoffs = Math.max(res.nCutoffs, s25r.peaks.length);
    }

    // 3. vertical aim
    let dv = 0;
    if (o.aimMode !== 'none') dv = o.target - vCut;
    dv += o.dvExtra || 0;

    // canonical cut-off line
    const cLine = cutoffLine(fc, -10, 10, 0.1, win, floorCd);
    res.cLine = cLine;

    // 4. kink (asymmetric classes only)
    let hk = null;
    if (res.hasKink) {
      const leftPts = cLine.filter(p => p.h >= -4 && p.h <= -1.5 && p.G >= 0.08);
      const vL = median(leftPts.map(p => p.v));
      const rightPts = cLine.filter(p => p.h >= 1.5 && p.h <= 5 && p.G >= 0.08);
      let vR = median(rightPts.map(p => p.v));
      if (!isFinite(vR)) vR = vL + 0.8;
      const step = vR - vL;
      res.stepHeight = step;
      // geometric method — fit inclined part
      const lo = vL + 0.12, hi = vL + Math.max(0.25, 0.8 * step);
      let incl = cLine.filter(p => p.h > -1.5 && p.h < 6 && p.G >= 0.08 && p.v >= lo && p.v <= hi);
      // keep contiguous run starting from first departure
      let geom = { h: NaN, slopeDeg: NaN, pts: incl };
      if (incl.length >= 3 && (incl[incl.length - 1].v - incl[0].v) > 0.1) {
        const fit = fitHonV(incl);
        if (fit) { geom.h = fit.c + fit.d * vL; geom.slopeDeg = Math.abs(fit.d) < 1e-9 ? 90 : Math.atan(1 / fit.d) * R2D; geom.fit = fit; }
      }
      if (!isFinite(geom.h)) {
        const dep = cLine.find(p => p.h > -1.5 && p.G >= 0.08 && p.v > vL + 0.5 * step);
        geom.h = dep ? dep.h - 0.05 : 0; geom.slopeDeg = 90;
      }
      if (geom.slopeDeg < 0) geom.slopeDeg += 180;
      res.kinkGeom = geom; res.vLcanon = vL;

      // Annex 6 §3.2 instrumental horizontal adjustment — each method iterated from the geometric pre-aim
      const dvA = dv - (o.dvExtra || 0);
      const methodA = () => { // (a) horizontal scan on 0.2D line, 5L…5R
        let dh0 = -geom.h, out = null;
        for (let it = 0; it < 3; it++) {
          const fa0 = transformed(fc, 1, dh0, dvA);
          const hs = hscan(fa0, -0.2, -5, 5, floorCd);
          out = { h: hs.h - dh0, G: hs.G, scan: hs };
          if (!isFinite(out.h)) break; dh0 = -out.h;
        }
        return out;
      };
      const methodB = () => { // (b) vertical scans 2D…2U at 1R, 2R, 3R; line through inflections ∩ line B
        let dh0 = -geom.h, out = null;
        for (let it = 0; it < 3; it++) {
          const fa0 = transformed(fc, 1, dh0, dvA);
          const pts = [1, 2, 3].map(x => { const s = vscan(fa0, x, -2, 2, floorCd); return { h: x, v: s.v, G: s.G }; });
          const ok = pts.filter(p => isFinite(p.v) && p.G >= 0.05);
          out = { h: NaN, G: ok.length ? Math.min(...ok.map(p => p.G)) : 0, pts, valid: false };
          if (ok.length < 3) { out.reason = 'no cut-off found on all three lines'; break; }
          const n = 3; let sx = 0, sy = 0, sxx = 0, sxy = 0;
          ok.forEach(p => { sx += p.h; sy += p.v; sxx += p.h * p.h; sxy += p.h * p.v; });
          const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
          const resid = Math.max(...ok.map(p => Math.abs(p.v - (a + b * p.h))));
          out.a = a; out.b = b; out.slopeDeg = Math.atan(b) * R2D; out.resid = resid;
          if (b < Math.tan(5 * D2R) || resid > 0.1) { out.reason = 'inclined part does not span 1R…3R (lines hit the upper plateau or the cut-off is not straight there)'; break; }
          const hStar = (o.target - a) / b;
          out.h = hStar - dh0; out.valid = true; dh0 = -out.h;
        }
        return out;
      };
      const ka = methodA(), kb = methodB();
      res.kinkA = ka; res.kinkB = kb;
      const chosen = o.hMethod === '3line' ? kb : o.hMethod === '02D' ? ka : { h: geom.h };
      if (!isFinite(chosen.h)) warnings.push('Selected horizontal-aim method gave no result' + (chosen.reason ? ' (' + chosen.reason + ')' : '') + ' — the geometric kink was used instead.');
      hk = isFinite(chosen.h) ? chosen.h : geom.h;
      res.kinkH = hk;
      res.kinkSlope = geom.slopeDeg;
      const ang = geom.slopeDeg;
      res.kinkShape = ang >= 60 ? 'vertical step (≥ 60°)' : ang >= 28 ? '≈ 45° inclined' : '≈ 15° inclined';
      kinkDir = traffic === 'RHT' ? 'Rising to the RIGHT (right-hand traffic)' : 'Rising to the LEFT (left-hand traffic)';
      res.kinkDir = kinkDir;
    }

    let dh = 0;
    if (o.aimMode === 'full' && hk != null) dh = -hk;
    dh += o.dhExtra || 0;
    res.aim = { dv, dh, cutoffRaw: vCut, kinkRaw: hk == null ? null : m * hk };
    res.cutoffAimed = vCut + dv;

    const fa = transformed(fcNoAp, 1, dh, dv); // aimed photometry without detector smoothing
    res.sampleAimed = fa;
    const vBottom = Math.max(vMin + dv, -30);

    // 5. regulation check
    const robustGrid = () => {
      const dvs = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3], dhs = [-0.5, -0.25, 0, 0.25, 0.5];
      return { dvs, dhs, grid: dvs.map(a => dhs.map(b => {
        const fx = transformed(fcNoAp, 1, dh + b, dv + a);
        return regulationCheck(fx, cls, vBottom).filter(x => !x.pass).map(x => x.id);
      })) };
    };
    if (symCls) {
      res.check = regulationCheck(fa, cls, vBottom);
      res.zonePoly = ZONE_1; res.zoneName = 'Zone 1';
      const cq = [];
      cq.push({ id: 'Number of cut-offs', value: res.nCutoffs, limit: '1', pass: res.nCutoffs <= 1, ref: 'Annex 6 (symmetrical)' });
      const gL = Math.max(res.G_10m, res.G_25m), gR = Math.max(res.G_10mR, res.G_25mR);
      cq.push({ id: 'Sharpness G at 2.5°L (best of 10 m/Ø10 mm, 25 m/Ø30 mm)', value: gL, limit: '≥ 0.08', pass: gL >= 0.08, ref: 'Annex 6 (symmetrical)' });
      cq.push({ id: 'Sharpness G at 2.5°R (best of 10 m/Ø10 mm, 25 m/Ø30 mm)', value: gR, limit: '≥ 0.08', pass: gR >= 0.08, ref: 'Annex 6 (symmetrical)' });
      const band = cLine.filter(p => Math.abs(p.h) <= 3 + 1e-9 && p.G >= 0.08 && isFinite(p.v));
      const dev = band.length ? Math.max(...band.map(p => Math.abs(p.v + dv - o.target))) : NaN;
      res.symBand = { dev, n: band.length };
      cq.push({ id: 'Straightness 3°L…3°R (max deviation from aimed line)', value: dev, unit: 'deg', limit: '≤ 0.30°', pass: dev <= 0.3, ref: 'Annex 6 (symmetrical)' });
      const d3L = Math.abs(res.scan3L.v + dv - o.target), d3R = Math.abs(res.scan3R.v + dv - o.target);
      cq.push({ id: 'Inflection at 3°L from nominal', value: d3L, unit: 'deg', limit: '≤ 0.30°', pass: d3L <= 0.3, ref: 'Annex 6 (symmetrical)' });
      cq.push({ id: 'Inflection at 3°R from nominal', value: d3R, unit: 'deg', limit: '≤ 0.30°', pass: d3R <= 0.3, ref: 'Annex 6 (symmetrical)' });
      cq.push({ id: 'Aimed cut-off position on V-V (Class ' + cls + ')', value: res.cutoffAimed, limit: '0.57°D', pass: Math.abs(res.cutoffAimed - CUTOFF_RANGE[cls][0]) <= 0.005, ref: 'Annex 6 (symmetrical)' });
      res.cutoffChecks = cq;
      res.robust = robustGrid();
    } else if (type === 'asym') {
      res.check = regulationCheck(fa, cls, vBottom);
      res.zonePoly = ZONE_IIIa; res.zoneName = 'Zone III';
      const rng = CUTOFF_RANGE[cls];
      const cq = [];
      cq.push({ id: 'Number of cut-offs', value: res.nCutoffs, limit: '1', pass: res.nCutoffs <= 1, ref: 'Annex 6 §2.1' });
      const sd = traffic === 'LHT' ? 'R' : 'L', gMin = Math.max(res.G_10m, res.G_25m);
      cq.push({ id: 'Sharpness G at 2.5°' + sd + ' — minimum (best of 10 m/Ø10 mm, 25 m/Ø30 mm)', value: gMin, limit: '≥ 0.13', pass: gMin >= 0.13, ref: 'Annex 6 §2.2' });
      cq.push({ id: 'Sharpness G at 2.5°' + sd + ' — maximum (25 m/Ø30 mm)', value: res.G_25m, limit: '≤ 0.40', pass: res.G_25m <= 0.40, ref: 'Annex 6 §2.2' });
      cq.push({ id: 'Linearity 1.5°–3.5° (inflection spread)', value: res.linearity, limit: '≤ 0.20°', pass: res.linearity <= 0.2, ref: 'Annex 6 §2.3' });
      if (o.hMethod === '02D') cq.push({ id: 'Kink gradient on 0.2D line', value: res.kinkA.G, limit: '≥ 0.08', pass: res.kinkA.G >= 0.08, ref: 'Annex 6 §3.2 (a)' });
      if (o.hMethod === '3line') cq.push({ id: 'Kink gradient on 1R/2R/3R lines (min)', value: res.kinkB.G, limit: '≥ 0.08', pass: res.kinkB.G >= 0.08, ref: 'Annex 6 §3.2 (b)' });
      const ca = res.cutoffAimed;
      cq.push({ id: 'Aimed cut-off position (Class ' + cls + ')', value: ca, limit: rng[0] === rng[1] ? Math.abs(rng[0]) + '°D' : Math.abs(rng[1]) + '°D … ' + Math.abs(rng[0]) + '°D', pass: ca >= rng[0] - 0.005 && ca <= rng[1] + 0.005, ref: 'Table 10 B' });
      if (o.aimMode !== 'full') cq.push({ id: 'Kink horizontal position from V-V', value: hk + dh, limit: '|x| ≤ 0.5°', pass: Math.abs(hk + dh) <= 0.5, ref: 'visual aim tolerance (info)' });
      res.cutoffChecks = cq;

      res.robust = robustGrid();
    }

    // 6. extra info
    const fl = flux(g, dv);
    res.flux = fl;
    // Imax (aimed, canonical)
    res.ImaxAimed = { I: g.Imax, h: m * g.ImaxAt.h + dh, v: g.ImaxAt.v + dv };
    res.IHV = fa(0, 0);
    res.I75R = fa(1.15, -0.57); res.IB50L = fa(-3.43, 0.57); res.I50V = fa(0, -0.86);
    res.ratio75RB50L = res.I75R / Math.max(res.IB50L, 1e-6);
    // max intensity above H-H in ±10°
    let mxUp = 0, mxUpAt = null;
    for (let h = -10; h <= 10.001; h += 0.1) for (let v = 0; v <= 4.001; v += 0.05) { const x = fa(h, v); if (x > mxUp) { mxUp = x; mxUpAt = { h, v }; } }
    res.maxAboveHH = { I: mxUp, at: mxUpAt };
    // beam widths on 25 m line (1.72D) and 2D
    const width = (vLine, thr) => {
      let l = null, r = null;
      for (let h = 0; h >= -60; h -= 0.1) { if (fa(h, vLine) >= thr) l = h; else if (l !== null && h < l - 1) break; }
      for (let h = 0; h <= 60; h += 0.1) { if (fa(h, vLine) >= thr) r = h; else if (r !== null && h > r + 1) break; }
      return { left: l, right: r };
    };
    res.widths = [
      { line: '1.72D (25 m)', thr: 1000, ...width(-1.72, 1000) },
      { line: '1.72D (25 m)', thr: 3000, ...width(-1.72, 3000) },
      { line: '3.0D', thr: 1000, ...width(-3.0, 1000) }
    ];
    // road range
    const hm = o.mountH;
    const range = (y, thr) => {
      for (let d = 300; d >= 2; d -= 0.5) {
        const rr = Math.sqrt(d * d + y * y);
        const H = Math.atan2(y, d) * R2D, Vv = -Math.atan(hm / rr) * R2D;
        const r3 = Math.pow(rr * rr + hm * hm, 1.5);
        const E = fa(H, Vv) * hm / r3;
        if (E >= thr) return d;
      }
      return null;
    };
    res.ranges = [
      { name: 'Straight ahead (V-V)', y: 0 },
      { name: 'Right road edge (3.5 m right)', y: 3.5 },
      { name: 'Left (3.5 m left, oncoming lane)', y: -3.5 }
    ].map(x => ({ ...x, r1: range(x.y, 1), r3: range(x.y, 3) }));
    res.geoReach = res.cutoffAimed < 0 ? hm / Math.tan(-res.cutoffAimed * D2R) : null;
    // human-readable type
    if (type === 'asym') res.typeLabel = 'Asymmetric passing beam — ' + (traffic === 'RHT' ? 'right-hand traffic (RHT)' : 'left-hand traffic (LHT)');
    else res.typeLabel = 'Symmetric passing beam (flat cut-off, no kink)';
    if (type === 'sym' && !symCls) res.verdict = 'Symmetric beam: the Class C table is for asymmetric passing beams. Choose Class CS or DS to check it as a symmetrical passing beam.';
    return res;
  }

  const api = { parseIES, buildGrid, makeSampler, transformed, vscan, hscan, analyse, classTable, regulationCheck, CUTOFF_RANGE, ZONE_IIIa, ZONE_1, SYM_CLASSES, flux, APERTURE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BCCore = api;
})(typeof window !== 'undefined' ? window : this);
