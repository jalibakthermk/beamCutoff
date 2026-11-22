import numpy as np, sys, gen_test as g
outdir = sys.argv[1] if len(sys.argv) > 1 else 'tests/out'
H,V,I = g.beam('asym', w=0.15, imax=30000)
C = np.round(np.arange(0,360,0.5),3); Cm = np.where(C>180, C-360, C)
gam = np.round(np.arange(70,105.0001,0.05),3)
# nearest/linear on H (H grid 0.1, Cm multiples of 0.5 inside +-45 else 0)
out = np.zeros((len(C), len(gam)))
for j,c in enumerate(Cm):
    if abs(c) > 45: continue
    jh = int(round((c+45)/0.1))
    iv0 = int(round((gam[0]-90+20)/0.05))
    out[j] = I[jh, iv0:iv0+len(gam)]
with open(outdir + '/rht_typeC.ies','w') as f:
    f.write('IESNA:LM-63-2002\nTILT=NONE\n')
    f.write(f'1 -1 1 {len(gam)} {len(C)} 1 2 0 0 0\n1 1 0\n')
    f.write(' '.join(f'{x:g}' for x in gam)+'\n'+' '.join(f'{x:g}' for x in C)+'\n')
    for row in out: f.write(' '.join(f'{x:.1f}' for x in row)+'\n')
# coarse 0.1 V res Type B, soft cutoff
H2,V2,I2 = g.beam('asym', w=0.15, imax=30000)
g.write(outdir + '/rht_soft.ies', H2, V2, I2)
g.write(outdir + '/rht_soft_coarse.ies', H2[::2], V2[::4], I2[::2, ::4])
