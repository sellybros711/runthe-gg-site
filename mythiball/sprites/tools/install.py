"""PUT THE BUILT TABLE INTO THE PAGE, idempotently.

    python3 tools/install.py            swap the table in
    python3 tools/install.py --revert   put the generated one back

THE BOUNDARY IS FOUND BY BRACE MATCHING, NEVER BY SEARCHING FOR "\\n};".
Doing it by string search works exactly once. The generated table was pretty
printed and ended on its own line, so the first install found the right end;
the built table is minified onto one line, so running install a second time
sent the search past the end of the table and into the page, and it deleted
every line between there and the next block that happened to close that way.
The page still parsed, V2_SPRITES was still an object, and the symptom was
`Sound is not defined` a thousand lines below the damage.

So the end of the table is found by counting braces from the opening one,
which is true whatever the formatting is, and the result is checked before it
is written: the page must still contain the handful of declarations that sit
after the table.
"""
import argparse
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PAGE = os.path.join(ROOT, '..', 'index.html')
BUILT = os.path.join(ROOT, 'build', 'sprites_v3.js')
BACKUP = os.path.join(ROOT, 'build', 'sprites_v2_generated.js.bak')

HEAD = """/* THE SPRITE TABLE IS THE HANDOFF PACK, not the generator any more.
   Built by mythiball/sprites/tools/build_table.py out of
   source_reference/ (all 68 characters, 64x64, right and left, no gaps)
   plus the animation strips the audit says are usable.

   EVERY CHARACTER COMES FROM ONE SOURCE. Half a roster in the new art and
   half in the old reads worse than either, and so does one character with a
   new idle and an old swing, because he changes species when he swings.
   729 of the poses here are real drawn frames from the pack.

   FIVE POSES THE PACK CANNOT DRAW STAND ON ITS STILLS. There is no rear
   view in the pack and no fielding art anywhere, so `back` and the two
   backruns are the LEFT facing still, and the game reads a profile where it
   used to read a pair of shoulders. That is a camera change rather than a
   hole: a batter in profile is what most baseball games show, and it stays
   inside the pack's own style. catch and throw stand on a still too, which
   is the handoff's own instruction for fielding art: fall back until it
   exists, never generate it.

   Do not hand edit this. Re-run tools/build_table.py and tools/install.py. */
"""

# lines that live BELOW the table, used to prove the swap did not eat any of
# the page. If one of these goes missing the write is refused.
SENTINELS = ['const v2FrameCache', 'function drawHeroSprite', 'const spriteStore',
             'function spriteCanvas', 'const Sound', 'function startGame']


def table_span(s):
    """(start, end) of the whole table block, by matching braces."""
    marks = ['/* THE SPRITE TABLE IS THE HANDOFF PACK', 'const V2_W = ']
    start = -1
    for m in marks:
        i = s.find(m)
        if i != -1:
            start = i
            break
    if start == -1:
        sys.exit('no sprite table found in the page')
    open_brace = s.index('{', s.index('const V2_SPRITES', start))
    depth, i = 0, open_brace
    while i < len(s):
        if s[i] == '{':
            depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0:
                break
        i += 1
    end = s.index(';', i) + 1
    return start, end


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--revert', action='store_true')
    args = ap.parse_args()

    page = os.path.abspath(PAGE)
    s = open(page, encoding='utf-8').read()
    a, b = table_span(s)

    if args.revert:
        if not os.path.exists(BACKUP):
            sys.exit('no backup to revert to')
        new = open(BACKUP, encoding='utf-8').read()
    else:
        if not os.path.exists(BACKUP):
            open(BACKUP, 'w', encoding='utf-8').write(s[a:b])
            print('  kept the generated table at %s' % os.path.relpath(BACKUP, ROOT))
        new = HEAD + open(BUILT, encoding='utf-8').read().rstrip('\n')

    out = s[:a] + new + s[b:]
    for sent in SENTINELS:
        if sent not in out:
            sys.exit('REFUSED: the swap would have removed %r from the page' % sent)
    shutil.copy(page, page + '.prev')
    open(page, 'w', encoding='utf-8').write(out)
    print('%s: %.2f MB -> %.2f MB' % (os.path.basename(page), len(s) / 1e6, len(out) / 1e6))
    print('  replaced %d chars with %d' % (b - a, len(new)))


if __name__ == '__main__':
    main()
