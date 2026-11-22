  /* Synthetic example beam (clearly labelled in UI): RHT, 15° kink, cut-off at 0.25°D raw, kink 0.4°R raw */
  function syntheticExample(p) {
    p = Object.assign({ vcut: -0.25, hk: 0.4, slope: 15, step: 0.75, w: 0.13, imax: 33000 }, p || {});
    const H = [], V = [];
    for (let h = -45; h <= 45.0001; h += 0.2) H.push(+h.toFixed(2));
    for (let v = -15; v <= 12.0001; v += 0.05) V.push(+v.toFixed(2));
    const nH = H.length, nV = V.length, I = new Float64Array(nH * nV);
    const tn = Math.tan(p.slope * Math.PI / 180);
    let Imax = 0, at = null;
    for (let j = 0; j < nH; j++) {
      const h = H[j];
      const c = p.vcut + Math.min(Math.max(tn * (h - p.hk), 0), p.step);
      const wh = h < 1.8 ? 3.6 : 6.5;
      for (let i = 0; i < nV; i++) {
        const v = V[i];
        const base = p.imax * Math.exp(-(((h - 1.8) / wh) ** 2) - (((v - (p.vcut - 0.75)) / 1.15) ** 2))
          + 7500 * Math.exp(-((h / 20) ** 2) - (((v - (p.vcut - 2.2)) / 3.2) ** 2))
          + 1500 * Math.exp(-((h / 38) ** 2) - (((v - (p.vcut - 5)) / 6) ** 2));
        const S = 1 / (1 + Math.exp((v - c) / p.w));
        let x = base * S + (v > c ? 230 * Math.exp(-(((v - c) / 5) ** 2)) * Math.exp(-((h / 30) ** 2)) : 0) + 4;
        I[j * nV + i] = x; if (x > Imax) { Imax = x; at = { h, v }; }
      }
    }
    const res = (a) => +(a[1] - a[0]).toFixed(4);
    return { H: Float64Array.from(H), V: Float64Array.from(V), I, nH, nV, Imax, ImaxAt: at, hRes: res(H), vRes: res(V), notes: ['Built-in synthetic example (RHT, 15° kink). Not a real lamp.'] };
  }
