import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.35 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.34', '0.4.35'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.34', '0.4.35');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.34', '0.4.35'].includes(manifest.version)) throw new Error('Expected the complete 0.4.34 baseline');
manifest.version = '0.4.35';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.34', '# NPC State Beta 0.4.35', 'README title');
if (!readme.includes('## Responsive recovery controls')) {
    readme = readme.replace(
        '## Terminal-status lifecycle reconciliation',
        `## Responsive recovery controls\n\n- Advanced Recovery no longer forces the Force Timeline Rebase description and its long action buttons into one horizontal settings row.\n- The rebase control now owns a full-width responsive layout: descriptive text sits above the actions, action buttons share available width without overflowing, and their labels may wrap instead of being clipped.\n- Narrow layouts collapse the recovery actions to one column while preserving the existing preserve-versus-rollback behavior and confirmations.\n\n## Terminal-status lifecycle reconciliation`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.35')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.35\n\n- Fixes Advanced Recovery / Force Timeline Rebase controls overflowing or clipping at ordinary settings-drawer widths.\n- Gives the force-rebase row a dedicated single-column content layout instead of inheriting the generic horizontal settings-row flex contract.\n- Recovery actions now use a bounded responsive grid; buttons are full-width within their grid cells and long labels wrap safely.\n- Narrow viewports stack the preserve and rollback actions vertically. No recovery, rebase, relationship, or lifecycle semantics changed.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.35');
