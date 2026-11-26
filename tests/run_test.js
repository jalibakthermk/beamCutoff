// Usage: node tests/run_test.js file1.ies [file2.ies ...]
const fs = require('fs'); const C = require('../src/core.js');
for (const fn of process.argv.slice(2)) {
  const t0 = Date.now();
  const g = C.buildGrid(C.parseIES(fs.readFileSync(fn, 'utf8')), {});
  const r = C.analyse(g, { cls: process.env.CLS || 'auto' });
  console.log('\n==', fn, (Date.now() - t0) + ' ms | class', r.cls, '|', r.typeLabel || r.verdict);
  if (r.type === 'none') continue;
  console.log('cut-off in file', r.aim.cutoffRaw.toFixed(3), '| G grid/10m/25m', [r.G_grid, r.G_10m, r.G_25m].map(x => x.toFixed(3)).join('/'), '| linearity', r.linearity.toFixed(3));
  if (r.hasKink) console.log('kink in file', r.aim.kinkRaw.toFixed(3), '|', r.kinkShape, 'slope', r.kinkSlope.toFixed(1), '| 0.2D', r.kinkA.h.toFixed(3), '| 3-line', r.kinkB.valid ? r.kinkB.h.toFixed(3) : 'n/a');
  if (!r.check) continue;
  r.cutoffChecks.forEach(c => console.log('  ', c.pass ? 'PASS' : 'FAIL', c.id, '=', +(+c.value).toFixed(3)));
  r.check.forEach(c => console.log('  ', c.pass ? 'PASS' : 'FAIL', c.id.padEnd(22), String(Math.round(c.value)).padStart(7), 'min', c.min, 'max', c.max));
}
