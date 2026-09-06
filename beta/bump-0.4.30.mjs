import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.30 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.29', '0.4.30'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.29', '0.4.30');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.29', '0.4.30'].includes(manifest.version)) throw new Error('Expected the complete 0.4.29 baseline');
manifest.version = '0.4.30';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.29', '# NPC State Beta 0.4.30', 'README title');
if (!readme.includes('## Safe timeline rebase relationship modes')) {
    readme = readme.replace(
        '## Recovery interruption and concurrency hardening',
        `## Safe timeline rebase relationship modes\n\n- Timeline acceptance and relationship rollback are now separate decisions. **Keep NPC state and accept timeline** is the safe default; **Roll back discarded story changes** is an explicit destructive alternative.\n- Preserve mode keeps relationship meters, fractional progress, milestones, history, the last relationship change, and summaries exactly as accepted before the rebase.\n- Preserved relationship evidence and diagnostics remain available as accepted pre-rebase audit history, while stale message ids and source-event keys are quarantined so they cannot masquerade as evidence from the new timeline.\n- Rollback mode previews affected NPCs and relationship changes before confirmation, then reverses only discarded-story relationship state supported by recoverable provenance.\n- Every explicit rebase stores a restorable pre-rebase snapshot before persistence. The immediate preserve-mode refresh cannot award relationship movement again, preventing duplicate changes when scan markers are reset by timeline repair.\n- Recovery and Advanced Recovery now expose the two modes directly and explain their consequences instead of treating rebase as an implicit relationship reset.\n\n## Recovery interruption and concurrency hardening`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.30')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.30\n\n- Separates timeline acceptance from relationship rollback. Preserve mode is now the safe default; rollback is an explicit alternative.\n- Preserve mode keeps relationship meters, fractional progress, milestones, history, the last relationship change, and relationship summaries intact across timeline rebase.\n- Retains relationship evidence and diagnostics as accepted pre-rebase audit history while quarantining stale message and source-event provenance from the newly accepted timeline.\n- Adds a rollback impact preview and saves a restorable pre-rebase snapshot before either rebase mode is persisted.\n- Prevents the immediate preserve-mode refresh from applying relationship movement again, closing duplicate-award cases after scan-marker or timeline resets.\n- Replaces the ambiguous rebase action with **Keep NPC state and accept timeline** and **Roll back discarded story changes**, including matching Advanced Recovery guidance.\n- Adds preserve/rollback regression coverage and replay-safe legacy verifier compatibility so repeated cold builds remain deterministic.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.30');
