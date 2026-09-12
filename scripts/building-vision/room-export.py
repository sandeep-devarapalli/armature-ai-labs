#!/usr/bin/env python3
"""Create two verified R03 room extracts and retain thirteen checked R02 extracts."""

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
    'FF': ('first-floor.FCStd', '337d7e2d4d8d60c83a4e867e43141bec6c3ed46314640b8df89493b8ed2e4a50'),
    'geometry': ('geometry.json', '13003e5f259aa46845c260a18a641c9d8a72d3e1ba6425918f0b06d4385683e9'),
    'selection': ('P03 public room selection.json', 'e94671f3923c29b42ccbb72ce97c4771fc408418119e7ed78b7a9873588828f4'),
}
RETAINED_RELEASE_SHA = '224342c1a9f38354895693821a91a08820d31d62016e6f3043ec85572ae03cf3'
RETAINED_ROOMS_SHA = '7d54d5337a8eefa2192e9310c4ade86ab59bba7c4824155143b33ffd529d7a09'
HELPERS = {'native':'build', 'verify':'verify', 'sanitize':'sanitize', 'previews':'previews', 'publish':'publish'}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--first-cad', type=Path, help='Verified P03 current-design first-floor CAD')
    parser.add_argument('--geometry', type=Path, help='Verified PB09 geometry.json room map')
    parser.add_argument('--selection', type=Path, help='Independently verified P03 per-room fit-out/context object allowlists')
    parser.add_argument('--preserved-room-root', '--retained-release', dest='retained_release', type=Path, default=Path(__file__).resolve().parents[2]/'public/building-models/r02', help='Preserved unpublished R02 checkpoint, including one moved outside public/')
    parser.add_argument('--external-room-downloads', type=Path, help='Actual verified GitHub room-file download records; required for any room asset >=25 MiB')
    parser.add_argument('--work-directory', type=Path, help='New or empty work directory; defaults to a fresh temporary directory')
    parser.add_argument('--destination', type=Path, default=Path(__file__).resolve().parents[2]/'public/building-models/r03/rooms', help='New public destination; an existing directory is never overwritten')
    parser.add_argument('--public-url', default='/building-models/r03/rooms/', help='URL prefix recorded in the public manifest')
    parser.add_argument('--freecad-python', type=Path, default=Path('/Applications/FreeCAD.app/Contents/Resources/bin/python'))
    parser.add_argument('--no-publish', action='store_true', help='Build and verify in temporary space without touching public files')
    parser.add_argument('--verify-only', type=Path, metavar='WORK_DIRECTORY', help='Read back an existing completed work package; do not create or modify exports')
    args = parser.parse_args()
    env = {'HOME':str(Path.home()),'PATH':'/usr/bin:/bin:/opt/homebrew/bin','QT_QPA_PLATFORM':'offscreen'}
    if args.verify_only:
        work = args.verify_only.resolve()
        if not (work/'Audit/build.json').is_file():parser.error('verify-only directory lacks Audit/build.json')
        subprocess.run([str(args.freecad_python), str(work/'verify.py')], env=env, check=True)
        return
    if not args.first_cad or not args.geometry or not args.selection:parser.error('--first-cad, --geometry and --selection are required')
    if any(value[1] is None for value in EXPECTED.values()):parser.error('P03 source and allowlist pins await independent acceptance; export is blocked')
    if not args.no_publish and args.destination.exists():parser.error('Destination already exists. Use --no-publish to verify a fresh rebuild; never overwrite an issued bundle.')
    sources={'FF':args.first_cad.resolve(),'geometry':args.geometry.resolve(),'selection':args.selection.resolve()}
    for key,path in sources.items():
        if not path.is_file():parser.error(f'Missing {key} source: {path}')
        if sha(path)!=EXPECTED[key][1]:parser.error(f'{key} is not the reviewed R03/PB09 source hash; stop for source review')
    retained=args.retained_release.resolve()
    if sha(retained/'release.json')!=RETAINED_RELEASE_SHA or sha(retained/'rooms/manifest.json')!=RETAINED_ROOMS_SHA:
        parser.error('Retained R02 checkpoint drift; original room evidence must be reviewed')
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
    (work/'Audit/retained.json').write_text(json.dumps({'root':str(retained),'releaseSha256':RETAINED_RELEASE_SHA,'roomManifestSha256':RETAINED_ROOMS_SHA},indent=2)+'\n')
    for helper,target in HELPERS.items():
        shutil.copy2(Path(__file__).with_name('room-export-'+helper+'.py'),work/(target+'.py'))
    env['ARMATURE_ROOM_DEST']=str(args.destination.resolve())
    env['ARMATURE_ROOM_PUBLIC_URL']=args.public_url
    if args.external_room_downloads:env['ARMATURE_ROOM_EXTERNAL_DOWNLOADS']=str(args.external_room_downloads.resolve())
    for filename,native in [('build',True),('sanitize',False),('verify',True),('previews',False)]:
        python=str(args.freecad_python) if native else sys.executable
        subprocess.run([python,str(work/(filename+'.py'))],env=env,check=True)
    if not args.no_publish:
        subprocess.run([sys.executable,str(work/'publish.py')],env=env,check=True)
    print('Verified work package:',work)
    print('Review every SVG/PNG before website deployment. Native source geometry was not changed.')


if __name__=='__main__':
    main()
