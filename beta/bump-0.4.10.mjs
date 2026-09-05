import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.9', '0.4.10'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.9', '0.4.10'].includes(manifest.version)) throw new Error('Expected the complete 0.4.9 baseline');
manifest.version = '0.4.10';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.9', '0.4.10');
if (!readme.includes('## Manual force timeline rebase')) {
    readme += '\n## Manual force timeline rebase\n\nRecovery & Branch Safety includes a **Force rebase to current chat** action even when NPC State currently considers the branch safe. This is an explicit recovery tool for cases where external edits, extension lifecycle events, or other unusual state leave the user wanting to accept the currently visible chat as a fresh branch baseline. When a rebase is already required, the normal warning banner remains the primary action instead of showing a duplicate force control.\n\nA force rebase uses the same durable-state and discarded-branch relationship rollback safeguards as an ordinary required rebase. If the visible lineage is already the exact tracked lineage and its latest assistant exchange was already scanned, NPC State carries that scan marker through the baseline reset. The follow-up scan can therefore rebuild live continuity without applying the already-consumed relationship delta a second time. If the visible lineage actually diverged, the marker is cleared and the surviving latest exchange is treated normally.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.10')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.10\n\n- Adds an explicit **Force rebase to current chat** recovery action under Recovery & Branch Safety, available even when branch safety is currently marked safe. Safe same-lineage force rebases preserve the latest already-scanned marker so the follow-up continuity refresh cannot score the same relationship event twice; genuine divergences continue to clear that marker and use the existing rollback/recovery path.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.10');
