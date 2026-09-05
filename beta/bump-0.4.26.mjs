import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.26 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.25', '0.4.26'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.25', '0.4.26'].includes(manifest.version)) throw new Error('Expected the complete 0.4.25 baseline');
manifest.version = '0.4.26';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.25', '# NPC State Beta 0.4.26', 'README title');
readme = readme.replace('its v0.4.25 meaning is **in chat**', 'its v0.4.26 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.25 clones', 'On first load for a chat with no beta sidecar, 0.4.26 clones');
readme = readme.replace('v0.4.25 applies one shared relationship-judgment rubric', 'v0.4.26 applies one shared relationship-judgment rubric');
if (!readme.includes('## General kinship projection')) {
    readme = readme.replace(
        '## Named family facts',
        `## General kinship projection\n\n- Grounded named family facts now cover direct siblings, aunts/uncles, nieces/nephews, cousins, grandparents/grandchildren, spouses, guardians/wards, and common in-law ties in addition to the existing child/parent family slots.\n- The owner keeps the explicit directional relation from narration, such as \`Mara - sister\` or \`Rowan - uncle\`. When the named relative already has a dossier, NPC State adds a conservative reciprocal relation without guessing unknown gender, such as \`sibling\`, \`niece/nephew\`, \`grandchild\`, or \`spouse\`.\n- Named relatives remain continuity metadata rather than automatic NPC admission. Public-evidence grounding, ambiguous short-name fail-closed behavior, manual Key relationships locks, and unnamed-family handling remain unchanged.\n\n## Named family facts`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.26')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.26\n\n- Generalizes named family projection beyond child/parent facts to direct siblings, aunts/uncles, nieces/nephews, cousins, grandparents/grandchildren, spouses, guardians/wards, and common in-law ties.\n- Adds conservative reciprocal Key relationships for relatives that already have dossiers while avoiding gender guesses when the inverse role is not established.\n- Preserves v0.4.25 named-member evidence boundaries, no-placeholder admission behavior, manual Key relationships locks, ambiguous-name fail-closed resolution, and existing twin/sibling inference.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.26');
