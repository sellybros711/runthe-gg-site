# Archive old source datasets out of data/ into ~/Desktop/runtheARCHIVE.
#
# Part of the dataset-swap process: after the pipeline scripts are pointed at a
# new world_cup_full_rosters_*.csv / .json version, run this to move the now-
# unreferenced previous versions out of data/ (kept, not deleted) so the folder
# only holds the live source files plus the players_all.* outputs.
#
# "Unused" = a data/world_cup_full_rosters_* file whose basename is not referenced
# by any project source file (.js / .py / .html). players_all.* are never touched.
# OS junk (.DS_Store) is removed rather than archived.
import os, glob, shutil

BASE    = os.path.dirname(os.path.abspath(__file__))
ARCHIVE = os.path.expanduser('~/Desktop/runtheARCHIVE')

# Collect every reference from the project's source files.
refs = ''
for root, dirs, files in os.walk(BASE):
    if os.sep + '.git' in root:
        continue
    for fn in files:
        if fn.endswith(('.js', '.py', '.html')):
            try:
                refs += open(os.path.join(root, fn), encoding='utf-8', errors='ignore').read()
            except OSError:
                pass

os.makedirs(ARCHIVE, exist_ok=True)
moved, kept = [], []
for path in sorted(glob.glob(os.path.join(BASE, 'data', 'world_cup_full_rosters_*'))):
    name = os.path.basename(path)
    if name in refs:
        kept.append(name)
        continue
    dest = os.path.join(ARCHIVE, name)
    if os.path.exists(dest):  # never clobber an existing archived file
        stem, ext = os.path.splitext(name)
        i = 1
        while os.path.exists(os.path.join(ARCHIVE, f'{stem}.dup{i}{ext}')):
            i += 1
        dest = os.path.join(ARCHIVE, f'{stem}.dup{i}{ext}')
    shutil.move(path, dest)
    moved.append(name)

# Remove OS junk (regenerates on its own; not worth archiving).
junk = []
ds = os.path.join(BASE, 'data', '.DS_Store')
if os.path.exists(ds):
    os.remove(ds)
    junk.append('data/.DS_Store')

print('Archive dir:', ARCHIVE)
print('Kept (referenced):', kept)
print('Archived:', moved)
if junk:
    print('Removed junk:', junk)
