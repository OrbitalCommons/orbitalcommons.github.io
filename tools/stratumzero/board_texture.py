import re, math
from PIL import Image, ImageDraw, ImageChops
import sys; D=sys.argv[1]; S=float(sys.argv[2]); X0,Y0=float(sys.argv[3]),float(sys.argv[4])
pcb=open(sys.argv[5]).read()
holes=[]
for f in re.split(r'\n\t\(footprint ',pcb)[1:]:
    at=re.search(r'\n\t\t\(at ([-\d.]+) ([-\d.]+) ?([-\d.]*)\)',f); x,y,rot=float(at[1]),float(at[2]),float(at[3] or 0)
    for p in re.finditer(r'\(pad "[^"]*" (thru_hole|np_thru_hole) \w+\s*\(at ([-\d.]+) ([-\d.]+)[^)]*\)(.*?)\n\t\t\)',f,re.S):
        dr=re.search(r'\(drill (?:oval )?([\d.]+)',p[4])
        if not dr: continue
        a=math.radians(-rot); px,py=float(p[2]),float(p[3])
        holes.append((x+px*math.cos(a)-py*math.sin(a), y+px*math.sin(a)+py*math.cos(a), float(dr[1])))
for m in re.finditer(r'\(via\s*\(at ([-\d.]+) ([-\d.]+)\)\s*\(size [\d.]+\)\s*\(drill ([\d.]+)\)',pcb):
    holes.append((float(m[1]),float(m[2]),float(m[3])))
print(len(holes),'holes')
def L(n): return Image.open(f'{D}/{n}.png').convert('RGBA').split()[3]   # alpha = drawn
def side(pre, out):
    cu,mask,silk=L(pre+'.Cu'),L(pre+'.Mask'),L(pre+'.Silkscreen')
    W,H=cu.size
    img=Image.new('RGBA',(W,H),(29,79,46,255))                  # mask over bare laminate
    img.paste((44,107,61,255),mask=cu)                            # mask over copper
    nocu=ImageChops.invert(cu)
    img.paste((156,140,90,255),mask=ImageChops.multiply(mask,nocu))  # opening, bare FR4
    img.paste((214,176,92,255),mask=ImageChops.multiply(mask,cu))    # opening over copper: ENIG
    silk_on=ImageChops.multiply(silk,ImageChops.invert(mask))
    img.paste((240,240,232,255),mask=silk_on)
    a=Image.new('L',(W,H),255); d=ImageDraw.Draw(a)
    for x,y,dd in holes:
        cx,cy,r=(x-X0)*S,(y-Y0)*S,dd/2*S
        d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=0)
    img.putalpha(a)
    img.save(out+'.png')
    img.convert('RGB').save(out+'.webp',quality=88)          # alpha via a separate cutout mask in three.js
    a.save(out+'-alpha.png')
side('F',D+'/top'); side('B',D+'/bottom')
