import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.28 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.27', '0.4.28'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.27', '0.4.28');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.27', '0.4.28'].includes(manifest.version)) throw new Error('Expected the complete 0.4.27 baseline');
manifest.version = '0.4.28';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.27', '# NPC State Beta 0.4.28', 'README title');
readme = readme.replaceAll('v0.4.27', 'v0.4.28');
if (!readme.includes('## Recovery and chronological rebuild')) {
    readme = readme.replace(
        '## Source-agnostic identity and presence grounding',
        `## Recovery and chronological rebuild\n\n- A missing beta sidecar can now be explicitly replaced without first hydrating the broken pointer. Recovery writes a new uniquely named sidecar under the existing writer lock, verifies that another tab has not already advanced the pointer, and switches this chat only after the replacement upload succeeds.\n- Rebuild from chat processes surviving assistant exchanges chronologically. Each model call receives only the chat prefix through the exchange being reconstructed, so future messages cannot leak into earlier historical judgments.\n- Recovery progress is persisted after every committed exchange. Reloads turn an interrupted running rebuild into a resumable pause; failed generations retry the same exchange; cancellation never advances an uncommitted step; edits to completed history stop with restart-required status, while edits confined to the unprocessed suffix are safely replanned without replaying completed work.\n- Relationship mode can either start meters fresh while reconstructing the rest of the dossier, or re-evaluate historical relationship changes through the normal evidence, cap, inertia, duplicate, and milestone rules.\n- Automatic stale deletion is deferred during reconstruction and applied once at the chosen end of the rebuilt range. Archival may still occur chronologically and can be restored by later reconstructed activity.\n- Recovery controls live under Recovery & Branch Safety with fresh initialization, all/latest/custom range selection, relationship mode, progress, resume, pause, cancel, and restart feedback. Normal scans and mutating dossier operations are blocked while an incomplete recovery owns chronology.\n\n## Source-agnostic identity and presence grounding`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.28')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.28\n\n- Adds explicit missing-sidecar fresh initialization and a resumable chronological reconstruction coordinator that never exposes future chat messages to earlier historical scans.\n- Persists rebuild range, relationship mode, message plan, lineage fingerprints, progress, failure state, pause/cancel state, and completion state in the replacement sidecar.\n- Adds two relationship recovery modes: start meters fresh while rebuilding all other dossier state, or re-evaluate history with the existing relationship evidence/progression engine unchanged.\n- Defers stale deletion until reconstruction completion, blocks ordinary writes while recovery chronology is incomplete, and safely replans only the unprocessed suffix after chat edits.\n- Extends Recovery & Branch Safety with missing-file recovery, all/latest/custom range selection, progress, resume, pause, cancel, and rebuild controls.\n- Fixes source/build consistency by committing every verifier fixture changed by cold transforms and checking the committed 0.4.28 checkout before regenerating from the pinned stable baseline.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.28');
