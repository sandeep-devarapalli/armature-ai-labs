#!/usr/bin/env python3
"""Remove local attribution paths from public FCStd copies without touching geometry."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PureWindowsPath
import re
import tempfile
import xml.etree.ElementTree as ET
import zipfile

LOCAL = re.compile(r'/Users/|/private/|/var/folders/|/tmp/|/home/|/Volumes/|(?<![A-Za-z])[A-Za-z]:[\\/]')
ALLOWED = {'DefinitionJSON', 'BaselineFile', 'SourceProposal', 'SourceNative', 'SourceFile'}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def clean(value):
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, list):
        return [clean(item) for item in value]
    if not isinstance(value, str) or not LOCAL.search(value):
        return value
    path = value.removeprefix('file://')
    if not LOCAL.match(path):
        raise ValueError('Embedded local path requires explicit review')
    return PureWindowsPath(path).name if re.match(r'^[A-Za-z]:', path) else Path(path).name

def sanitize(source, target):
    source, target = source.resolve(), target.resolve()
    if source == target:
        raise ValueError('Use a frozen input copy, never edit the input in place')
    if target.name not in {'ground-floor.FCStd', 'first-floor.FCStd'} or target.parent.parts[-3:] != ('public', 'building-models', 'r01'):
        raise ValueError('Output must be a public/building-models/r01 full-floor copy')
    original = source.read_bytes()
    if target.exists() and target.read_bytes() != original:
        raise ValueError('Existing public target differs from frozen input; stop and review')
    with zipfile.ZipFile(source) as archive:
        assert archive.testzip() is None
        infos = archive.infolist()
        data = {info.filename: archive.read(info.filename) for info in infos}
        comment = archive.comment
    before = dict(data)
    tree = ET.fromstring(data['Document.xml'])
    changes = []
    for obj in tree.findall('ObjectData/Object'):
        for prop in obj.findall('Properties/Property'):
            node = prop.find('String')
            value = node.get('value', '') if node is not None else ''
            if not LOCAL.search(value):
                continue
            if prop.get('type') != 'App::PropertyString' or prop.get('name') not in ALLOWED:
                raise ValueError(f'Non-attribution path needs review: {obj.get("name")}.{prop.get("name")}')
            if prop.get('name') == 'DefinitionJSON':
                decoded = json.loads(value)
                replacement = json.dumps(clean(decoded), ensure_ascii=False, sort_keys=True)
            else:
                replacement = clean(value)
            assert not LOCAL.search(replacement)
            changes.append({'object':obj.get('name'), 'property':prop.get('name'),
                            'original_value_sha256':digest(value.encode()), 'public_value':replacement})
            node.set('value', replacement)
    data['Document.xml'] = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
    for name, content in data.items():
        if name.lower().endswith('.xml') and LOCAL.search(content.decode('utf-8')):
            raise ValueError(f'Unreviewed local path remains in {name}')
    assert all(data[name] == before[name] for name in data if name != 'Document.xml')
    # Reconstruct the expected XML by changing only the reviewed attribution strings.
    expected = ET.fromstring(before['Document.xml'])
    for change in changes:
        node = expected.find(f'ObjectData/Object[@name="{change["object"]}"]/Properties/Property[@name="{change["property"]}"]/String')
        assert digest(node.get('value').encode()) == change['original_value_sha256']
        node.set('value', change['public_value'])
    assert ET.tostring(expected) == ET.tostring(tree)
    target.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='.cad-metadata-', suffix='.FCStd', dir=target.parent)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, 'w') as archive:
            archive.comment = comment
            for info in infos:
                archive.writestr(info, data[info.filename])
        with zipfile.ZipFile(temporary) as archive:
            assert archive.testzip() is None
            assert archive.namelist() == [info.filename for info in infos]
            assert all(archive.read(name) == content for name, content in data.items())
        assert source.read_bytes() == original
        if target.exists():
            assert target.read_bytes() == original
        os.replace(temporary, target)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    payloads = {name:digest(content) for name,content in before.items() if name != 'Document.xml'}
    return {'status':'PASS_XML_AND_PAYLOADS', 'input_sha256':digest(original),
            'output_sha256':digest(target.read_bytes()), 'file':target.name,
            'metadata_changes':changes, 'all_non_Document_XML_members_byte_identical':True,
            'archive_member_order_preserved':True, 'payload_sha256':payloads,
            'native_reopen':'Required separately before publication'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=Path, help='Frozen original FCStd copy')
    parser.add_argument('--output', required=True, type=Path, help='Public full-floor FCStd copy')
    parser.add_argument('--audit', required=True, type=Path, help='Audit JSON outside the public tree')
    args = parser.parse_args()
    if 'public' in args.audit.resolve().parts:
        parser.error('Audit must remain outside the public directory')
    report = sanitize(args.input, args.output)
    args.audit.parent.mkdir(parents=True, exist_ok=True)
    args.audit.write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps({key:value for key,value in report.items() if key not in {'payload_sha256','metadata_changes'}}, indent=2))

if __name__ == '__main__':
    main()
