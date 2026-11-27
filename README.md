<img src="favicon.svg" width="56" alt="beamCutoff logo">

# beamCutoff

Low-beam cut-off analyser for headlamp IES files, with UN R149 passing-beam checks (00 series): Class C (asymmetric) and Classes CS and DS (symmetrical).

**Live tool:** https://jalibakthermk.github.io/beamCutoff/

The IES file is read in your browser. Nothing is uploaded.

## What it reports

- **Beam type**: asymmetric RHT, asymmetric LHT, symmetric (flat cut-off) or no cut-off (driving beam).
- **Kink**: direction (rising right / left), shape (≈15°, ≈45°, vertical step), slope and step height.
- **Horizontal cut-off position** at 2.5° from V-V, in file angles and after aiming.
- **Cut-off gradient G** on the file grid and with the Annex 6 detector apertures (10 m / Ø10 mm, 25 m / Ø30 mm).
- **Kink position** by three methods: geometric line intersection, 0.2D line scan (Annex 6 §3.2 a) and three-line method 1R/2R/3R (Annex 6 §3.2 b).
- **UN R149 Class C check** after aiming: all Table 9 test points and segments, Zone III and Imax, with margins. Cut-off quality: one cut-off, G ≥ 0.13, G ≤ 0.40 (25 m), linearity ≤ 0.2°, aimed cut-off position.
- **UN R149 Class CS / DS check** for symmetrical passing beams: Table 35 points 1–15, Line 1, Zones 1 and 2 and the sums of points 8+9+10 and 11+12+13. The cut-off inflection on V-V is aimed to 0.57°D. Cut-off quality: one cut-off, G ≥ 0.08 at 2.5°L and 2.5°R, cut-off within ±0.3° between 3°L and 3°R. **Auto** picks Class C for a beam with a kink and CS for a flat cut-off.
- **Aim robustness**: failing items for vertical ±0.3° and horizontal ±0.5° aim deviation.
- **Additional data**: luminous flux (total, above H-H), Imax position, HV, 75R/B50L ratio, beam spread, cut-off reach on the road and 1 lx / 3 lx road illuminance reach for a given mounting height.
- **Reports**: PDF and HTML report download, CSV download, JSON copy.

## Using it

Open an IES file with **Open IES**, the drop zone, or by dropping it anywhere on the page. The verdict bar at the top lists any failing item; click one to jump to its row. The section bar under it moves between the map, scans, cut-off quality, photometry, aim robustness and beam data. Export the report from **PDF report** or the **Export** menu (HTML, CSV, JSON). Settings that are rarely changed (file axes, aim offsets, detector aperture, mounting height) are under **Advanced**, together with the cut-off gradient options: an intensity threshold in cd (a gradient sample counts only where the darker of its two intensities reaches it; default 100 cd, 0 = off) and noise reduction for ray-traced files. Parsing and analysis run in a background Web Worker, so large files (millions of values) do not freeze the page; a new setting cancels an analysis that is still running.

## Input

IES LM-63 files with H-V photometry (Type A/B, H right +, V up +) or Type C (mapped H = C, V = γ − 90°). Axis flip options handle files with V positive down or H positive left. For a reliable gradient use a vertical resolution of 0.05° or finer.

## Repository layout

| Path | Content |
|---|---|
| `index.html` | The built tool (served by GitHub Pages). Styles come from the shared [beamKit](https://jalibakthermk.github.io/beamkit/demo.html) framework plus beamCutoff-specific CSS |
| `favicon.svg` | Logo / icon (the favicon is also inlined in `index.html`) |
| `src/core.js` | IES parser, cut-off analysis, R149 Class C, CS and DS tables and checks (no DOM; also runs in Node) |
| `src/report.js` | PDF writer (no dependencies), HTML report, CSV/JSON export |
| `src/example.js` | Synthetic example beam shown on start-up (not a real lamp) |
| `src/index.src.html` | Page template |
| `src/build.py` | Builds `index.html` from the sources: `python3 src/build.py` |
| `tests/` | Synthetic beam generators and a Node test runner: `./tests/gen_all.sh` (needs numpy); `CLS=DS node tests/run_test.js file.ies` forces a class |

## Limits

Photometric limits are taken from the published text of UN R149, 00 series. Verify them against your controlled copy of the regulation (00 series, Supplement 6) before using results for approval work. The CS/DS sums for points 8+9+10 and 11+12+13 are not legible in the published 00-series text; the values used (150 cd and 300 cd) come from the later R149 text. Not covered: other passing-beam classes (V, E, W, A/B/D, AS, BS, ES), bending mode, colour and stability tests. One lamp is evaluated with its full intensity.

## Licence

MIT © 2026 Jalib Akther
