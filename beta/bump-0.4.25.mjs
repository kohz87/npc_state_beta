import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.25 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.24', '0.4.25'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.24', '0.4.25'].includes(manifest.version)) throw new Error('Expected the complete 0.4.24 baseline');
manifest.version = '0.4.25';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.24', '# NPC State Beta 0.4.25', 'README title');
readme = readme.replace('its v0.4.24 meaning is **in chat**', 'its v0.4.25 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.24 clones', 'On first load for a chat with no beta sidecar, 0.4.25 clones');
readme = readme.replace('v0.4.24 applies one shared relationship-judgment rubric', 'v0.4.25 applies one shared relationship-judgment rubric');
if (!readme.includes('## Named family facts')) {
    readme = readme.replace(
        '## Presence grounding',
        `## Named family facts\n\n- Explicit countable family facts may now carry the names actually established in visible narration. For example, \"Greta has twin daughters Lyra and Talia\" stores the two-daughter family slot and also projects \`Lyra - daughter\` and \`Talia - daughter\` into Greta's durable key relationships.\n- Named family members do not become NPC dossiers merely because they are relatives. NPC admission remains governed by the normal admission policy and active-scene relevance.\n- Unnamed family remains private countable continuity exactly as before. Family-member names must be grounded in public profile evidence; names found only in World_State/private control blocks are not promoted. Ambiguous short-name matches fail closed when resolving a named relative to an existing dossier.\n\n## Presence grounding`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.25')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.25\n\n- Fixes explicit named family facts such as twin daughters being retained as countable family slots while failing to appear in the owner dossier Key relationships.\n- Adds optional named members to family facts and deterministically projects grounded member names into the owner keyRelationships without creating placeholder NPC dossiers.\n- Preserves unnamed-family slot behavior, manual key-relationship locks, evidence boundaries, counterpart merge semantics, and conservative sibling/twin resolution.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.25');
