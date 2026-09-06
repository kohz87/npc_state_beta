import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.41 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.40', '0.4.41'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.40', '0.4.41');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.40', '0.4.41'].includes(manifest.version)) throw new Error('Expected the complete 0.4.40 baseline');
manifest.version = '0.4.41';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.40', '# NPC State Beta 0.4.41', 'README title');
if (!readme.includes('## Settings observer and recovery UI performance')) {
    readme = readme.replace(
        '## Foreground hot-path performance',
        `## Settings observer and recovery UI performance\n\n- The settings layout coordinator now changes the Relationship Rubric and Memory Rubric labels only when their text actually differs. Repeated layout passes therefore do not create their own child-list mutations and cannot keep the settings MutationObserver alive in a self-triggering loop.\n- Branch/recovery overlays no longer call the compatibility full-state snapshot just to inspect branch safety. A dedicated branch-safety read returns only that small record.\n- Recovery status uses the existing lightweight recovery-status API directly. A valid null result means there is no active recovery and does not fall through to a second full-state read.\n- These changes affect UI scheduling/read amplification only. Scanner, lifecycle, relationship, recovery, branch-rebase, persistence, and dossier semantics are unchanged.\n\n## Foreground hot-path performance`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.41\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.41\n\n- Breaks a self-triggering settings MutationObserver loop by guarding Relationship Rubric and Memory Rubric label writes with equality checks.\n- Adds a lightweight branch-safety status read for recovery/rebase overlays instead of cloning the complete NPC State sidecar.\n- Treats a null recovery-status result as authoritative no-active-recovery state instead of falling back to another full-state snapshot.\n- Changes no scanner, lifecycle, relationship, branch/recovery, admission, dossier, or persistence semantics.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.41');
