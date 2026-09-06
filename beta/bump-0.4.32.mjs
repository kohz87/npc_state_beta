import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.32 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.31', '0.4.32'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.31', '0.4.32');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.31', '0.4.32'].includes(manifest.version)) throw new Error('Expected the complete 0.4.31 baseline');
manifest.version = '0.4.32';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.31', '# NPC State Beta 0.4.32', 'README title');
if (!readme.includes('## Operation-context ownership and rollback replay continuity')) {
    readme = readme.replace(
        '## Rebase state and operation-boundary hardening',
        `## Operation-context ownership and rollback replay continuity\n\n- Queued manual dossier mutations are now bound to the chat that initiated them. They recheck chat identity after queue acquisition and hydration, before mutation, and immediately before checkpoint persistence.\n- Manual add/edit/restore/staleness operations receive the originating chat context explicitly instead of reading whichever chat is visible when their queue slot opens. This prevents another chat's lineage from being written into the origin chat's checkpoints.\n- Explicit relationship rollback retains the longest still-valid accepted-history replay boundary created by an earlier preserve rebase. Already accepted exchanges remain non-scoring after preserve-to-rollback transitions, while rewritten or genuinely new exchanges after the divergence remain eligible.\n- Rollback replay-boundary retention also protects the accepted exchange when preserve refresh previously failed and the user switches to rollback afterward.\n- These changes affect operation ownership and replay bookkeeping only. Relationship evidence semantics, keyword policy, inertia, caps, fractional progression, and milestone thresholds are unchanged.\n\n## Rebase state and operation-boundary hardening`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.32')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.32\n\n- Binds queued manual dossier mutations to their originating chat and aborts them if chat ownership changes after queue acquisition/hydration or before mutation/checkpoint persistence.\n- Passes the originating chat context into manual add/edit/restore/staleness mutation logic so another visible chat can never supply checkpoint lineage or source-message metadata for the origin chat.\n- Retains the longest still-valid accepted relationship replay boundary when switching from preserve rebase to explicit rollback, preventing accepted old exchanges from being scored again during rollback refresh.\n- Keeps genuinely uncounted exchanges beyond the retained boundary eligible for normal relationship progression, including repeated dialogue in a later exchange.\n- Adds focused engine regressions for queued manual-edit chat switching, hydration-time switching, preserve-to-rollback replay suppression, failed-preserve-to-rollback suppression, boundary truncation, and new post-boundary progression.\n- Leaves relationship keyword policy, semantic judgment, inertia, caps, fractional progression, and milestone behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.32');
