import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.21 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.20', '0.4.21'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.20', '0.4.21'].includes(manifest.version)) throw new Error('Expected the complete 0.4.20 baseline');
manifest.version = '0.4.21';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.20', '# NPC State Beta 0.4.21', 'README title');
readme = readme.replace('its v0.4.20 meaning is **in chat**', 'its v0.4.21 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.20 clones', 'On first load for a chat with no beta sidecar, 0.4.21 clones');
if (!readme.includes('## Relationship history remarks')) {
    readme = readme.replace(
        '## Evidence-backed relationship judgment',
        `## Relationship history remarks\n\n- v0.4.21 preserves accepted per-axis relationship explanations in visible relationship history instead of dropping them during dossier normalization. A supplied overall reason remains the preferred concise remark.\n- When an applied history entry has no overall reason, the dossier shows only explanations for axes whose displayed scores actually changed, with axis labels and duplicate explanation text collapsed.\n- Older entries may recover explanations from relationship evidence/diagnostic history only when event identity and corroborating metadata resolve to one unambiguous event. Otherwise the dossier shows \"No explanation recorded.\" without inventing a reason or substituting raw quotations.\n- This is persistence/presentation only: scoring, caps, inertia, fractional progress, milestone gates, axis selection, duplicate protection, manual edits, and branch/rebase behavior are unchanged.\n\n## Evidence-backed relationship judgment`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.21')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.21\n\n- Preserves accepted per-axis relationship evidence/explanations in `relationshipHistory` through normalization, save/reload, and existing state import/export paths.\n- Keeps nonempty overall reasons as the primary recent-change remark; otherwise renders concise, escaped axis-labelled explanations only for axes whose scores actually changed.\n- Recovers older missing remarks only from an unambiguous evidence/diagnostic event matched by event identity plus corroborating metadata, with a neutral `No explanation recorded.` fallback for missing or ambiguous history.\n- Leaves relationship scores, caps, inertia, fractional progress, milestone gates, axis selection, duplicate protection, manual edits, and branch/rebase behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.21');
