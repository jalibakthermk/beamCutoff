"""Build the single-file index.html from index.src.html + core.js + example.js + report.js."""
from pathlib import Path
here = Path(__file__).parent
s = (here / 'index.src.html').read_text()
for tag, f in [('/*CORE*/', 'core.js'), ('/*EXAMPLE*/', 'example.js'), ('/*REPORT_WIRING*/', 'report.js')]:
    assert tag in s, tag
    s = s.replace(tag, (here / f).read_text())
(here.parent / 'index.html').write_text(s)
print('built index.html', len(s), 'bytes')
