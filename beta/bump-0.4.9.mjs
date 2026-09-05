import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.8', '0.4.9'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.8', '0.4.9'].includes(manifest.version)) throw new Error('Expected the complete 0.4.8 baseline');
manifest.version = '0.4.9';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.8', '0.4.9');
if (!readme.includes('## Timeline rebase relationship rollback')) {
    readme += '\n## Timeline rebase relationship rollback\n\nRelationship deltas and milestone breakthroughs are timeline-sensitive rather than timeless dossier canon. When an explicit rebase accepts a surviving chat after a pre-baseline truncation or rewrite, NPC State now rolls back non-manual relationship events attributed to discarded message ids before establishing the new branch base. Recent scoring diagnostics are used to restore exact score/fractional state when possible; older visible deltas are reversed as a fallback. Discarded milestone unlocks are removed, and if older history is no longer sufficient to reconstruct an over-gate score exactly, that axis is conservatively clamped back to the first now-locked boundary. Manual relationship edits remain authoritative.\n\nAfter rebase, surviving relationship history and milestone provenance becomes part of the accepted baseline and its old message references are cleared. Recent relationship evidence/diagnostics are also cleared so discarded text cannot participate in future deduplication or scoring. Durable profile canon, memories, portraits, manual profile locks, archives, social ties, and deletion tombstones continue to survive rebase.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.9')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.9\n\n- Fixes explicit timeline rebase retaining relationship changes and 25/50/75/90 gate breakthroughs from discarded branch messages. Rebase now reverses attributable non-manual relationship changes where recoverable, removes stale milestone unlocks, restores fractional state from recent scoring diagnostics when available, and clamps unrecoverable over-gate residue back to the first now-locked boundary. Manual relationship edits remain authoritative.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.9');
