#!/usr/bin/env python3
"""Create verified R01 room-reference CAD downloads in a fresh workspace."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

EXPECTED = {
    'GF': ('Ground Floor - Coordinated Planning R01.FCStd', '145082c570bb32572b96a83886545c1118a37b6a9f5e64bf76d6511a38e7abfc'),
    'FF': ('First Floor - Coordinated Planning R01.FCStd', '4c8c65dbf487ba996e61ec38a3640ef5b5e97587f980dac338b09f3ac406a971'),
    'geometry': ('geometry.json', '13003e5f259aa46845c260a18a641c9d8a72d3e1ba6425918f0b06d4385683e9'),
}
HELPERS = {'native':'build', 'verify':'verify', 'sanitize':'sanitize', 'previews':'previews', 'publish':'publish'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-directory', type=Path, help='Verified R01 CAD directory containing both full-floor FCStd files')
    parser.add_argument('--geometry', type=Path, help='Verified PB09 geometry.json room map')
    parser.add_argument('--work-directory', type=Path, help='New or empty work directory; defaults to a fresh temporary directory')
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[2]/'public/building-models/r01/rooms', help='New public destination; an existing directory is never overwritten')
    parser.add_argument('--public-url', default='/building-models/r01/rooms/', help='URL prefix recorded in the public manifest')
    parser.add_argument('--freecad-python', type=Path, default=Path('/Applications/FreeCAD.app/Contents/Resources/bin/python'))
    parser.add_argument('--no-publish', action='store_true', help='Build and verify in temporary space without touching public files')
    parser.add_argument('--verify-only', type=Path, metavar='WORK_DIRECTORY', help='Read back an existing completed work package; do not create or modify exports')
    args = parser.parse_args()
    env = os.environ.copy()
    env['QT_QPA_PLATFORM'] = 'offscreen'
    if args.verify_only:
        work = args.verify_only.resolve()
        if not (work/'Audit/build.json').is_file():parser.error('verify-only directory lacks Audit/build.json')
        subprocess.run([str(args.freecad_python), str(work/'verify.py')], env=env, check=True)
        return
    if not args.source_directory or not args.geometry:parser.error('--source-directory and --geometry are required for a new export')
    if not args.no_publish and args.destination.exists():parser.error('Destination already exists. Use --no-publish to verify a fresh rebuild; never overwrite an issued bundle.')
    source_dir=args.source_directory.resolve()
    sources={key:(args.geometry.resolve() if key=='geometry' else source_dir/name) for key,(name,_) in EXPECTED.items()}
    for key,path in sources.items():
        if not path.is_file():parser.error(f'Missing {key} source: {path}')
        if sha(path)!=EXPECTED[key][1]:parser.error(f'{key} is not the approved R01/PB09 source hash; stop for source review')
    if args.work_directory:
        work=args.work_directory.resolve()
        if work.exists() and any(work.iterdir()):parser.error('Work directory must be new or empty')
        work.mkdir(parents=True,exist_ok=True)
    else:
        work=Path(tempfile.mkdtemp(prefix='armature-room-export-'))
    for folder in ['Inputs','Audit','rooms']:(work/folder).mkdir()
    frozen={}
    for key,path in sources.items():
        target=work/'Inputs'/(key+path.suffix)
        shutil.copy2(path,target)
        assert sha(path)==sha(target)==EXPECTED[key][1]
        frozen[key]={'source':str(path),'frozen':str(target),'sha256':EXPECTED[key][1]}
    (work/'Audit/frozen.json').write_text(json.dumps(frozen,indent=2)+'\n')
    for helper,target in HELPERS.items():
        shutil.copy2(Path(__file__).with_name('room-export-'+helper+'.py'),work/(target+'.py'))
    env['ARMATURE_ROOM_DEST']=str(args.destination.resolve())
    env['ARMATURE_ROOM_PUBLIC_URL']=args.public_url
    for filename,native in [('build',True),('sanitize',False),('verify',True),('previews',False)]:
        python=str(args.freecad_python) if native else sys.executable
        subprocess.run([python,str(work/(filename+'.py'))],env=env,check=True)
    if not args.no_publish:
        subprocess.run([sys.executable,str(work/'publish.py')],env=env,check=True)
    print('Verified work package:',work)
    print('Review every SVG/PNG before website deployment. Native source geometry was not changed.')


if __name__=='__main__':
    main()
