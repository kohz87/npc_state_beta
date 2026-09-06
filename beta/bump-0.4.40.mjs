import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.40 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.39', '0.4.40'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.39', '0.4.40');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.39', '0.4.40'].includes(manifest.version)) throw new Error('Expected the complete 0.4.39 baseline');
manifest.version = '0.4.40';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.39', '# NPC State Beta 0.4.40', 'README title');
if (!readme.includes('## Foreground hot-path performance')) {
    readme = readme.replace(
        '## Dossier state projection performance',
        `## Foreground hot-path performance\n\n- Foreground prompt refresh no longer clones the complete v0.4 sidecar, portraits, checkpoints, diagnostics, and relationship audit history included. It uses a purpose-built immutable injection projection containing only continuity fields consumed by prompt construction.\n- The runtime opts out of the engine's compatibility state-change snapshot because the installed callback does not consume it. The engine keeps snapshot delivery enabled by default for other callers/tests.\n- Repeated SillyTavern MESSAGE_UPDATED events no longer tear down and rebuild an unchanged in-chat NPC strip. The strip is signature-checked and reuses its existing DOM and decoded portraits when nothing relevant changed.\n- Successful embedded/recovery commits no longer trigger an immediate second full surface refresh after persistence already emitted the state-change refresh.\n- These are hot-path performance changes only. Scanner, lifecycle, relationship, branch/recovery, stale-management, and persistence semantics are unchanged.\n\n## Dossier state projection performance`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.40\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.40\n\n- Adds an injection-specific immutable state projection so normal foreground prompt refreshes never clone portrait payloads, checkpoint/rebase snapshots, diagnostics, or relationship audit history.\n- Avoids the engine state-change snapshot clone in the installed runtime callback while retaining snapshot delivery as the engine default for compatibility.\n- Makes the in-chat NPC strip idempotent across repeated MESSAGE_UPDATED events and uses async/lazy image decoding when it must rebuild.\n- Removes redundant post-persist surface refreshes from successful embedded and separate recovery scan paths.\n- Changes no scanner, lifecycle, relationship, branch/recovery, stale-management, admission, or persistence semantics.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.40');
