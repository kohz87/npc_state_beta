import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.14 version marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.14 README section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.13', '0.4.14'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.13', '0.4.14'].includes(manifest.version)) throw new Error('Expected the complete 0.4.13 baseline');
manifest.version = '0.4.14';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.13', '# NPC State Beta 0.4.14', 'README title');
readme = readme.replace('its v0.4.13 meaning is **in chat**', 'its v0.4.14 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.13 clones', 'On first load for a chat with no beta sidecar, 0.4.14 clones');
readme = replaceSection(
    readme,
    '## Settings organization',
    '## Compact appearance presentation',
    `## Settings organization\n\n- v0.4.14 is a presentation-only settings cleanup. Existing control IDs, stored keys, defaults, and listeners are preserved; scanner, storage, relationship, dossier, and branch semantics are unchanged.\n- **Scanning & Capture** is the only settings category open by default and now owns Auto Scan, context depth, new-NPC admission/history, Scanner Response Limit, and malformed-capture recovery.\n- Continuity Injection, Birthday & Aging, Dossier Evolution, Relationships, Recovery & Branch Safety, Advanced, Maintenance, and Portraits remain collapsed until needed. Relationship and memory rubrics are no longer presented together as one vague Advanced Rubrics bucket.\n- Recovery keeps ordinary branch-rescan controls at the main level. Force Timeline Rebase is nested under **Advanced Recovery**, while the normal Rebase action still appears automatically when NPC State detects a branch-safety problem.\n- Birthday controls remain progressive: Off shows only the fill policy, Unknown also exposes the local fill action, and Random additionally exposes calendar and fallback-days controls. This changes presentation only.\n\n`,
    'settings organization',
);
readme = readme.replace(
    'Recovery & Branch Safety includes **Maximum scanner response tokens**, from 512 to 15,000 (default 7,000).',
    'Scanning & Capture includes **Scanner Response Limit**, from 512 to 15,000 tokens (default 7,000).',
);
readme = readme.replace(
    'Recovery & Branch Safety includes a **Force rebase to current chat** action even when NPC State currently considers the branch safe.',
    'Recovery & Branch Safety keeps **Force Timeline Rebase** inside the collapsed **Advanced Recovery** subsection when NPC State currently considers the branch safe.',
);
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.14')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.14\n\n- Reorganizes the settings panel without changing stored setting keys, defaults, listeners, scanner behavior, dossier behavior, persistence, or branch semantics.\n- Renames the primary Tracking category to Scanning & Capture and moves Scanner Response Limit plus malformed-capture recovery into that operational section.\n- Renames Birthday Continuity to Birthday & Aging, separates Relationships from Advanced, and moves the memory rubric plus maintenance tools beneath Advanced.\n- Keeps Recovery & Branch Safety focused on branch handling and nests Force Timeline Rebase under an explicit Advanced Recovery disclosure.\n- Refreshes responsive spacing and warning treatment so the same hierarchy remains readable in narrow SillyTavern sidebars.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.14');
