import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.39 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.38', '0.4.39'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.38', '0.4.39');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.38', '0.4.39'].includes(manifest.version)) throw new Error('Expected the complete 0.4.38 baseline');
manifest.version = '0.4.39';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.38', '# NPC State Beta 0.4.39', 'README title');
if (!readme.includes('## Dossier state projection performance')) {
    readme = readme.replace(
        '## Dossier rendering performance',
        `## Dossier state projection performance\n\n- The Dossier Library no longer obtains a full cloned NPC State sidecar just to build its roster or open one dossier. It uses lightweight roster projections plus a clone of only the selected NPC.\n- Portrait data URLs are excluded from roster projections. Cast-card portraits request their immutable source only when a card approaches the visible rail, so opening/searching the library does not clone every stored portrait.\n- Roster summaries and inline in-chat cards use the same lightweight read path. The public full-state API remains available for compatibility.\n- These are read-path/runtime performance changes only. Scanner, lifecycle, relationship, recovery, branch, stale-management, and persistence semantics are unchanged.\n\n## Dossier rendering performance`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.39\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.39\n\n- Replaces Dossier Library full-sidecar reads with lightweight roster projections and a clone of only the selected NPC.\n- Keeps portrait data URLs out of roster projections; lazy cast portrait hydration requests one immutable source at a time from the engine cache.\n- Moves roster summary, inline in-chat cards, archive/delete lookup, and editor-open reads off the full `getState()` clone path.\n- Preserves the public full-state snapshot API and changes no scanner, lifecycle, relationship, recovery, branch, stale-management, or persistence semantics.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.39');