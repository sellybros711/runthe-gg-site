"""Writes the pixel icon set into golf/index.html.

    python3 golf/pixel-icons/build.py

icons.py is the one colour UI set (PXICONS), pxi.py the coloured trophy, tile and coin set
(PXI, PX_COINS, PX_TOKEN), draw.py the canvas both are drawn on. Edit a drawing there and
run this, rather than editing the rows in the page by hand."""
import os
import re, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icons import I
from pxi import P, EMBLEMS
f=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s=open(f).read()
m=re.search(r'const PXICONS=\{\n(.*?)\n\};',s,re.S)
oldk=list(json.loads('{'+m.group(1).replace('\n','')+'}').keys())
assert set(oldk)<=set(I), set(oldk)-set(I)
oldk+=[k for k in I if k not in oldk]   # new icons go on the end, so a diff shows only them
body=',\n'.join(f'"{k}":{json.dumps(I[k])}' for k in oldk)
s=s[:m.start()]+'const PXICONS={\n'+body+'\n};'+s[m.end():]
s=re.sub(r'const PX_COINS=\[.*?\];',lambda _:'const PX_COINS='+json.dumps(P['COINS'])+';',s,count=1)
s=re.sub(r'const PX_TOKEN=\[.*?\];',lambda _:'const PX_TOKEN='+json.dumps(P['TOKEN'])+';',s,count=1)
m=re.search(r'const PXI=(\{.*?\});\n',s,re.S)
okeys=list(json.loads(m.group(1)).keys())
assert set(okeys)<=set(P), set(okeys)-set(P)
okeys+=[k for k in P if k not in okeys and k not in ('COINS','TOKEN')]
s=s[:m.start()]+'const PXI='+json.dumps({k:P[k] for k in okeys},separators=(',',':'))+';\n'+s[m.end():]
# which PXI drawing, in which colour, each coloured emoji stand-in is (pxmore.EMBLEMS)
em=json.dumps({k:list(v) for k,v in EMBLEMS.items()},separators=(',',':'))
s,n=re.subn(r'const PX_EMBLEM=\{.*?\};',lambda _:'const PX_EMBLEM='+em+';',s,count=1)
if not n:
    i=s.index('function pxColorEmblem(')
    s=s[:i]+'const PX_EMBLEM='+em+';\n'+s[i:]
open(f,'w').write(s)
print('ok')
