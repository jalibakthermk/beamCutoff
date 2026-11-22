"""Generate synthetic low-beam IES files with known cut-off geometry for testing."""
import numpy as np, sys

def beam(kind, vcut=-0.2, hk=0.3, slope=15.0, step=0.9, w=0.07, imax=38000, flip=False):
    H = np.round(np.arange(-45, 45.0001, 0.1), 3)
    V = np.round(np.arange(-20, 15.0001, 0.05), 3)
    hh, vv = np.meshgrid(H, V, indexing='ij')
    base = (imax * np.exp(-((hh - 1.0) / 5.5) ** 2 - ((vv - (vcut - 1.0)) / 1.4) ** 2)
            + 9000 * np.exp(-(hh / 22) ** 2 - ((vv - (vcut - 2.0)) / 3.5) ** 2))
    if kind == 'high':
        I = 60000 * np.exp(-(hh / 6) ** 2 - (vv / 3) ** 2) + 200
        return H, V, I
    if kind == 'sym':
        c = np.full_like(hh, vcut)
    else:
        rise = np.tan(np.radians(slope)) * (hh - hk)
        c = vcut + np.clip(rise, 0, step)
    S = 1 / (1 + np.exp((vv - c) / w))
    I = base * S + 250 * np.exp(-((vv - c) / 6) ** 2) * (vv > c) + 0
    I = np.maximum(I, 5)
    if flip:  # LHT
        I = I[::-1, :]
    return H, V, I

def write(path, H, V, I):
    with open(path, 'w') as f:
        f.write('IESNA:LM-63-2002\n[TEST] synthetic\n[MANUFAC] beamCutoff test\nTILT=NONE\n')
        f.write(f'1 -1 1 {len(V)} {len(H)} 2 2 0 0 0\n1 1 0\n')
        f.write(' '.join(f'{v:g}' for v in V) + '\n')
        f.write(' '.join(f'{h:g}' for h in H) + '\n')
        for j in range(len(H)):
            f.write(' '.join(f'{x:.1f}' for x in I[j]) + '\n')

if __name__ == '__main__':
    out = sys.argv[1]
    write(f'{out}/rht15.ies', *beam('asym'))
    write(f'{out}/rht45.ies', *beam('asym', slope=45, hk=-0.4, vcut=0.1))
    write(f'{out}/lht15.ies', *beam('asym', flip=True))
    write(f'{out}/sym.ies', *beam('sym'))
    write(f'{out}/high.ies', *beam('high'))
