import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.37 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.36', '0.4.37'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.36', '0.4.37');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.36', '0.4.37'].includes(manifest.version)) throw new Error('Expected the complete 0.4.36 baseline');
manifest.version = '0.4.37';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.36', '# NPC State Beta 0.4.37', 'README title');
if (!readme.includes('## Dossier diagnostics visibility')) {
    readme = readme.replace(
        '## Lifecycle reconciliation and manual life-state recovery',
        `## Dossier diagnostics visibility\n\n- Raw dossier diagnostics are hidden by default to keep the library document lighter. The setting **Show dossier diagnostics** persists globally for NPC State Beta.\n- The dossier More menu also provides a quick Show diagnostics / Hide diagnostics control. Hidden diagnostics are not rendered into the dossier DOM; relationship change history remains visible.\n- This is a presentation/performance control only. Diagnostic data continues to be recorded in state so it can be shown again without rescanning.\n\n## Lifecycle reconciliation and manual life-state recovery`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.37\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.37\n\n- Adds a persistent Show dossier diagnostics toggle, off by default.\n- Adds a matching quick toggle in the dossier More menu.\n- When hidden, life-state and relationship-scoring diagnostic blocks are not rendered into the dossier DOM; diagnostic state is still retained and Recent relationship changes remains visible.\n- No scanner, lifecycle, relationship scoring, admission, or stale-management semantics changed.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.37');
