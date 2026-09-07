from pathlib import Path
import subprocess

BASE = 'ae85c0a680792e68a1b8631deb94fabc0f2b5080'
ROOT = Path.cwd()
TRANSFER = Path(__file__).resolve().parent

def git(*args, input=None):
    return subprocess.check_output(['git', *args], input=input, text=True).strip()

def apply(rows):
    for name, expected, edits in rows:
        path = ROOT / name
        assert not name.startswith('/') and '..' not in path.relative_to(ROOT).parts
        lines = path.read_text(encoding='utf-8').splitlines(keepends=True) if path.exists() else []
        for start, count, replacement in reversed(edits):
            assert 0 <= start <= len(lines) and start + count <= len(lines), name
            lines[start:start + count] = replacement.splitlines(keepends=True)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(''.join(lines), encoding='utf-8')
        actual = git('hash-object', name)
        assert actual == expected, f'{name}: expected {expected}, got {actual}'
        print('Verified blob', name, actual, flush=True)

assert git('rev-parse', 'HEAD') == BASE
assert not git('status', '--porcelain'), 'baseline checkout is not clean'
commits = [
('ab9295aa52b0185fa9c39f6090bf8a3a4b60d61c', range(1, 6), '''tree c4144580f461c5862316876153a7cf406c2c0b25
parent ae85c0a680792e68a1b8631deb94fabc0f2b5080
author OpenAI automation <41898282+github-actions[bot]@users.noreply.github.com> 1788795022 +0000
committer OpenAI automation <41898282+github-actions[bot]@users.noreply.github.com> 1788795022 +0000

fix: align embedded output contract and capture ownership

Release 0.7.7; semantic contract 5 and foreground contract 6, preserving v1 transport and storage schemas. Share strict parser-tested JSON examples across capture and scans, reject schema drift without repair, bind diagnostics/deduplication/cleanup to source and attempt identity, and preserve explicit-only fallback. Add 50 parser and real-host simulation regressions. Full suite: 257 pass; source validation, package integrity and import-depth tests pass. No live provider or user database accessed.
'''),
('d132973cce0046e81701ec0a8946b5a740a69a9b', [6], '''tree f35f4708ccaa58ee6b9b8bf3846ef3ebdcbd87d2
parent ab9295aa52b0185fa9c39f6090bf8a3a4b60d61c
author OpenAI automation <41898282+github-actions[bot]@users.noreply.github.com> 1788795444 +0000
committer OpenAI automation <41898282+github-actions[bot]@users.noreply.github.com> 1788795444 +0000

fix: reject superseded capture attempts across async boundaries

Independent review of ab9295a reproduced old attempts committing after same-narrative recapture, loss of truncated-tag diagnostics on duplicate events, and completeness requesting against changed preceding history. Bind the attempt to commit ownership, preserve cleaned completion identity, validate completeness source before queued work, and retain documented legacy identity spelling and sparse swipe metadata compatibility. Added regressions including lengthy narrative/Inventory capture. Validation, 263 tests, packaging and ZIP integrity pass; release remains 0.7.7.
'''),
]
for expected, parts, raw in commits:
    for part in parts:
        file = TRANSFER / f'edits-{part}.py'
        exec(compile(file.read_text(encoding='utf-8'), str(file), 'exec'), {'apply': apply})
    git('add', '-A')
    expected_tree = raw.splitlines()[0].split()[1]
    assert git('write-tree') == expected_tree, 'candidate tree differs from local reviewed tree'
    assert git('hash-object', '-t', 'commit', '-w', '--stdin', input=raw) == expected, 'commit identity mismatch'
    git('reset', '--hard', expected)
    print('Verified exact reviewed commit', expected, flush=True)
assert not git('status', '--porcelain')
assert not (ROOT / '.review').exists()
