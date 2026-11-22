# beamCutoff

Low-beam cut-off analyser for headlamp IES files, with a UN R149 passing-beam check (00 series, Class C).

**Live tool:** https://jalibakthermk.github.io/beamCutoff/

The IES file is read in your browser. Nothing is uploaded.

## What it reports

- **Beam type**: asymmetric RHT, asymmetric LHT, symmetric (flat cut-off) or no cut-off (driving beam).
- **Kink**: direction (rising right / left), shape (≈15°, ≈45°, vertical step), slope and step height.
- **Horizontal cut-off position** at 2.5° from V-V, in file angles and after aiming.
- **Cut-off gradient G** on the file grid and with the Annex 6 detector apertures (10 m / Ø10 mm, 25 m / Ø30 mm).
- **Kink position** by three methods: geometric line intersection, 0.2D line scan (Annex 6 §3.2 a) and three-line method 1R/2R/3R (Annex 6 §3.2 b).
- **UN R149 Class C check** after aiming: all Table 9 test points and segments, Zone III and Imax, with margins. Cut-off quality: one cut-off, G ≥ 0.13, G ≤ 0.40 (25 m), linearity ≤ 0.2°, aimed cut-off position.
- **Aim robustness**: failing items for vertical ±0.3° and horizontal ±0.5° aim deviation.
- **Additional data**: luminous flux (total, above H-H), Imax position, HV, 75R/B50L ratio, beam spread, cut-off reach on the road and 1 lx / 3 lx road illuminance reach for a given mounting height.
- **Reports**: PDF and HTML report download, CSV download, JSON copy.

## Input

IES LM-63 files with H-V photometry (Type A/B, H right +, V up +) or Type C (mapped H = C, V = γ − 90°). Axis flip options handle files with V positive down or H positive left. For a reliable gradient use a vertical resolution of 0.05° or finer.

## Repository layout

| Path | Content |
|---|---|
| `index.html` | The built single-file tool (served by GitHub Pages) |
| `src/core.js` | IES parser, cut-off analysis, R149 Class C table and check (no DOM; also runs in Node) |
| `src/report.js` | PDF writer (no dependencies), HTML report, CSV/JSON export |
| `src/example.js` | Synthetic example beam shown on start-up (not a real lamp) |
| `src/index.src.html` | Page template |
| `src/build.py` | Builds `index.html` from the sources: `python3 src/build.py` |
| `tests/` | Synthetic beam generators and a Node test runner: `./tests/gen_all.sh` (needs numpy) |

## Limits

Photometric limits are taken from the published text of UN R149, 00 series. Verify them against your controlled copy of the regulation (00 series, Supplement 6) before using results for approval work. Not covered: other passing-beam classes (V, E, W, A/B/D), bending mode, symmetric passing beams (AS–ES), colour and stability tests. One lamp is evaluated with its full intensity.

## Licence

MIT © 2026 Jalib Akther
