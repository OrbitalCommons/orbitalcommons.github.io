import re, json, math
def parts(path):
    s=open(path).read(); out={}
    for fp in re.split(r'\n\t\(footprint ',s)[1:]:
        ref=re.search(r'\(property "Reference" "([^"]+)"',fp)[1]; val=re.search(r'\(property "Value" "([^"]+)"',fp)[1]
        at=re.search(r'\n\t\t\(at ([-\d.]+) ([-\d.]+)',fp); layer=re.search(r'\(layer "([^"]+)"\)',fp)[1]
        out[ref]=dict(v=val,x=float(at[1]),y=float(at[2]),side='B' if layer.startswith('B') else 'F')
    return out
car=parts('/tmp/szweb/board/calibrator.kicad_pcb'); mod=parts('/tmp/szweb/gumstick/current-df40-connectors/module.kicad_pcb')
KEY={'power':['J3','U11','U14','U1','D1'],'gnss':['U6','J5','BT1','D75','U5','D74'],'trigger':['J6','J7','U9','U7','U10'],
     'ocxo':['Y1','U15'],'brightness':['U17','U18','SJ1'],'logic':['U2','DS1','J8'],'interface':['J1','J2']}
KEY['display']=[f'D{i}' for i in range(10,74)]+[f'Q{i}' for i in range(1,17)]+['U3','U4']
grp={r:g for g,rs in KEY.items() for r in rs}
keys=[(r,g) for r,g in grp.items() if r in car]
for r,p in car.items():
    if r in grp: continue
    if r.startswith('H'): continue
    if p['x']<135 and r[0] in 'RC' and p['y']>28: grp[r]='display'; continue
    best=min(keys,key=lambda k:(car[k[0]]['x']-p['x'])**2+(car[k[0]]['y']-p['y'])**2); grp[r]=best[1]
C={r:[p['v'],grp.get(r,'interface'),p['side']] for r,p in car.items() if not r.startswith('H')}
M={r:[p['v'],'module',p['side']] for r,p in mod.items() if not r.startswith('H')}
import collections; print(collections.Counter(g for _,g,_ in C.values()))
js='// Generated from the KiCad boards by tools: ref -> [value, block, side].\nexport const CARRIER = '+json.dumps(C,separators=(',',':'))+';\nexport const MODULE = '+json.dumps(M,separators=(',',':'))+';\n'
open('/Users/meawoppl/repos/orbitalcommons.github.io/projects/stratumzero/parts.js','w').write(js); print(len(js))
