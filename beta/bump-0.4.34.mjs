import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.34 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.33', '0.4.34'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.33', '0.4.34');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.33', '0.4.34'].includes(manifest.version)) throw new Error('Expected the complete 0.4.33 baseline');
manifest.version = '0.4.34';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.33', '# NPC State Beta 0.4.34', 'README title');
if (!readme.includes('## Terminal-status lifecycle reconciliation')) {
    readme = readme.replace(
        '## Grounded semantic life-state transitions',
        `## Terminal-status lifecycle reconciliation\n\n- Existing dossier Status and Life state are now supplied together to foreground, recovery, and targeted scanners. This prevents an old terminal condition from being hidden behind a bare active/unarchived roster entry.\n- A scanner may repair a legacy lifecycle mismatch when the stored Status itself unambiguously establishes that the same dossier is dead, slain, or terminally/irreversibly dissolved. The model still owns that semantic judgment; the backend does not parse death vocabulary.\n- For this narrow repair, the backend accepts only the exact stored Status as dossier-scoped evidence, with explicit/strong certainty. Stored status can never authorize livingReturn or another dead-to-alive transition.\n- A repaired death uses the normal confirmed-death invariant immediately, so the dossier becomes deceased/archived and cannot remain in worldActive/off-screen activity.\n\n## Grounded semantic life-state transitions`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.34')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.34\n\n- Fixes legacy/current dossiers whose stored activity/condition already describes terminal death or irreversible dissolution while lifeState/worldActive still says alive/off-screen.\n- Exposes Status plus Life state to foreground, recovery, and targeted scanner continuity so the model can see and reconcile the contradiction.\n- Adds a narrow dossier-scoped evidence path: an explicit/strong dead proposal may use the exact existing Status string as evidence for legacy death repair, while the backend still performs no English death-word parsing.\n- Stored Status is never valid evidence for livingReturn or dead-to-alive changes.\n- Reconciled deaths immediately use the shared deceased archival transition, clearing in-chat/off-screen activity while preserving dossier and relationship history.\n- Adds regressions for dissolved-to-mana, deceased-and-absorbed, slain-corpse conditions, worldActive conflict resolution, exact-status provenance, and resurrection isolation.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.34');
