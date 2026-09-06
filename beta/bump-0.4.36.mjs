import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.36 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.35', '0.4.36'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.35', '0.4.36');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.35', '0.4.36'].includes(manifest.version)) throw new Error('Expected the complete 0.4.35 baseline');
manifest.version = '0.4.36';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.35', '# NPC State Beta 0.4.36', 'README title');
if (!readme.includes('## Lifecycle reconciliation and manual life-state recovery')) {
    readme = readme.replace(
        '## Responsive recovery controls',
        `## Lifecycle reconciliation and manual life-state recovery\n\n- Confirmed lifecycle transitions now have a dedicated top-level lifeStateUpdates channel, independent of ordinary activity/profile patches. This prevents an NPC with a terminal status such as deceased after irreversible dissolution from being missed merely because the model omitted that NPC from the normal patch list.\n- Stored Status reconciliation is explicitly mandatory through that channel even when the original death event is old or the NPC is not currently active. Current terminal dissolution still requires grounded target-specific evidence and explicit/strong certainty; reversible transformations remain non-death.\n- The dossier editor now exposes Life state and its note. Manual Dead immediately archives as deceased; manual Alive or Unknown can clear a deceased archive without reviving unrelated manual/stale archives. Manual edits remain authoritative and do not require narrative evidence.\n\n## Responsive recovery controls`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.36\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.36\n\n- Adds a dedicated lifeStateUpdates scanner channel so terminal lifecycle repairs are not lost when an otherwise inactive NPC is omitted from the ordinary npcs patch list.\n- Makes stored terminal Status reconciliation mandatory in foreground, recovery, and targeted-refresh prompts, including explicitly deceased irreversible dissolution/destruction while preserving the model-owned semantic boundary.\n- Adds manual Life state editing to the dossier editor. Dead archives immediately as deceased; Alive/Unknown can recover a deceased dossier while leaving unrelated manual/stale archives untouched.\n- Adds lifecycle/manual-recovery regressions and cold-build release parity. Relationship, scoring, admission, and stale-management policy are unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.36');
