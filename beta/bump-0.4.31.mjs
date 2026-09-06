import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.31 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.30', '0.4.31'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.30', '0.4.31');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.30', '0.4.31'].includes(manifest.version)) throw new Error('Expected the complete 0.4.30 baseline');
manifest.version = '0.4.31';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.30', '# NPC State Beta 0.4.31', 'README title');
if (!readme.includes('## Rebase state and operation-boundary hardening')) {
    readme = readme.replace(
        '## Safe timeline rebase relationship modes',
        `## Rebase state and operation-boundary hardening\n\n- Unsafe pre-baseline branch divergence is now published to the live cache before persistence, so scans, injection, and UI immediately observe **rebase-required**. A failed sidecar write cannot silently leave live scanning enabled.\n- Rebase and rollback preview are bound to the chat that started the operation. Chat identity is rechecked after queue wait/load and before commit or follow-up refresh so another chat's visible history can never become the origin chat's baseline.\n- Preserve-mode rebase stores a durable accepted-relationship replay boundary for the accepted lineage. Failed refreshes, manual retries, and reloads cannot award the same accepted exchanges again, while later exchanges remain fully eligible for normal relationship progression.\n- The pre-rebase recovery backup is durable metadata outside timeline checkpoints. Restoring an earlier branch checkpoint no longer deletes the most recent rebase backup.\n- These changes harden state ownership and persistence only. Relationship evidence semantics, keyword policy, inertia, impact caps, fractional progression, and milestone thresholds are unchanged.\n\n## Safe timeline rebase relationship modes`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.31')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.31\n\n- Publishes unsafe branch state to the live cache before persistence so `rebase-required` immediately blocks scans/injection/UI, including when the sidecar write fails.\n- Binds queued rebase and rollback preview to their originating chat and rechecks ownership after queue/load and before commit or follow-up refresh.\n- Persists an accepted relationship replay boundary for preserve-mode rebase, preventing the same accepted exchanges from scoring again after failed refresh, manual retry, or reload while allowing genuinely new exchanges to progress normally.\n- Preserves `rebaseBackup` across checkpoint rollback so branch restoration cannot erase the latest pre-rebase recovery snapshot.\n- Adds engine-level regressions for unsafe-state publication, persistence failure, queued chat switching, preview chat switching, replay protection across failure/reload, new post-boundary events, and backup retention.\n- Leaves relationship keyword policy, semantic judgment, inertia, caps, fractional progression, and milestone behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.31');
