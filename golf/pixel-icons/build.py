"""Writes the pixel icon set into golf/index.html.

    python3 golf/pixel-icons/build.py

icons.py is the one colour UI set (PXICONS), pxi.py the coloured trophy, tile and coin set
(PXI, PX_COINS, PX_TOKEN), draw.py the canvas both are drawn on. Edit a drawing there and
run this, rather than editing the rows in the page by hand."""
import os
import re, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icons import I
from pxi import P
f=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
s=open(f).read()
m=re.search(r'const PXICONS=\{\n(.*?)\n\};',s,re.S)
oldk=json.loads('{'+m.group(1).replace('\n','')+'}').keys()
assert set(oldk)==set(I)
body=',\n'.join(f'"{k}":{json.dumps(I[k])}' for k in oldk)
s=s[:m.start()]+'const PXICONS={\n'+body+'\n};'+s[m.end():]
s=re.sub(r'const PX_COINS=\[.*?\];',lambda _:'const PX_COINS='+json.dumps(P['COINS'])+';',s,count=1)
s=re.sub(r'const PX_TOKEN=\[.*?\];',lambda _:'const PX_TOKEN='+json.dumps(P['TOKEN'])+';',s,count=1)
m=re.search(r'const PXI=(\{.*?\});\n',s,re.S)
okeys=json.loads(m.group(1)).keys()
assert set(okeys)|{'COINS','TOKEN'}==set(P),set(P)^set(okeys)
s=s[:m.start()]+'const PXI='+json.dumps({k:P[k] for k in okeys},separators=(',',':'))+';\n'+s[m.end():]
open(f,'w').write(s)
print('ok')
