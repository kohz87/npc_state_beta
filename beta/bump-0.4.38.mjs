import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.38 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.37', '0.4.38'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.37', '0.4.38');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.37', '0.4.38'].includes(manifest.version)) throw new Error('Expected the complete 0.4.37 baseline');
manifest.version = '0.4.38';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.37', '# NPC State Beta 0.4.38', 'README title');
if (!readme.includes('## Dossier rendering performance')) {
    readme = readme.replace(
        '## Dossier diagnostics visibility',
        `## Dossier rendering performance\n\n- Removes the full-screen backdrop blur from the Dossier Library. The opaque dim overlay preserves focus without continuously recompositing the SillyTavern page behind it.\n- Cast-rail portraits are hydrated only when they approach the visible rail instead of embedding every stored portrait data URL into the initial library HTML.\n- Dossier selection rerenders only the detail pane, while search rerenders only the cast rail. Cast-card clicks use one delegated listener instead of rebuilding listeners for the full roster.\n- These are presentation/runtime performance changes only. NPC state, scanner, lifecycle, relationship, recovery, and persistence semantics are unchanged.\n\n## Dossier diagnostics visibility`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.38\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.38\n\n- Removes the Dossier Library full-screen backdrop blur to avoid continuous page recompositing while the overlay is open.\n- Defers cast-rail portrait sources and hydrates only nearby cards, preventing large portrait data URLs from being duplicated into the initial rail HTML.\n- Separates rail-only and detail-only dossier rerenders, delegates cast-card selection, and frame-coalesces search updates.\n- Keeps diagnostics hidden-by-default behavior from v0.4.37 and changes no scanner, lifecycle, relationship, recovery, or persistence semantics.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.38');