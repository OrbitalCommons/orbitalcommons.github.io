from PIL import Image
R='/tmp/szweb/r'; O='/Users/meawoppl/repos/orbitalcommons.github.io/projects/stratumzero/img'
def save(im, name, widths=(1600,800), q=84):
    out=[]
    for w in widths:
        x=im if im.width<=w else im.resize((w, round(im.height*w/im.width)), Image.LANCZOS)
        x.save(f'{O}/{name}-{w}.webp', quality=q, method=6); out.append((w,x.size))
    print(name, out)
def crop_alpha(name, margin=0.03):
    im=Image.open(f'{R}/{name}.png'); l,t,r,b=im.getbbox(); m=int(margin*(r-l))
    return im.crop((max(0,l-m),max(0,t-m),min(im.width,r+m),min(im.height,b+m)))
for n,o in [('hero','hero'),('angle_left','angle-left'),('edge_right','edge-right'),('low_leds','low-leds'),('bottom','bottom'),('mod_iso','module-iso')]:
    save(crop_alpha(n), o, widths=(2000,1200,700) if n=='hero' else (1600,800))
top=Image.open(f'{R}/top_hi.png'); S=21.45; X0,Y0=1653,916
save(crop_alpha('top_hi',0.01),'top',widths=(2400,1400,800))
for n in ('mod_top','mod_bottom'): save(crop_alpha(n,0.02), n.replace('mod_','module-'))
def mm(x0,y0,x1,y1): return top.crop((round(X0+(x0-20)*S),round(Y0+(y0-10)*S),round(X0+(x1-20)*S),round(Y0+(y1-10)*S)))
crops={'crop-power':(166,10,212,44),'crop-ocxo':(140,54,169,77),'crop-gnss':(166,72,212,110),'crop-trigger':(166,40,212,76),
       'crop-leds':(88,22,134,72),'crop-module-site':(140,10,170,57),'crop-brightness':(126,40,150,76),'crop-oled':(132,72,162,104)}
for k,v in crops.items(): save(mm(*v),k,widths=(1000,600))
# social card
hero=crop_alpha('hero'); bg=Image.new('RGB',(1200,630),(5,7,13)); h=hero.copy(); h.thumbnail((1150,600)); bg.paste(h,((1200-h.width)//2,(630-h.height)//2),h); bg.save(O+'/../og.jpg',quality=86)
