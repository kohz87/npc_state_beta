import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.15 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.14', '0.4.15'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.14', '0.4.15'].includes(manifest.version)) throw new Error('Expected the complete 0.4.14 baseline');
manifest.version = '0.4.15';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.14', '# NPC State Beta 0.4.15', 'README title');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.14 clones', 'On first load for a chat with no beta sidecar, 0.4.15 clones');
readme = readme.replace('its v0.4.14 meaning is **in chat**', 'its v0.4.15 meaning is **in chat**');
if (!readme.includes('## World-state identity bridge')) {
    readme = readme.replace(
        '## Settings organization',
        `## World-state identity bridge\n\n- v0.4.15 fixes new-NPC creation when the visible narration clearly introduces an individual by role or occupation but the canonical proper name is supplied only by the current \`<World_State>\` block. Example: visible \"the clerk\" plus World_State \"Kora Lind — Guild Clerk\" may resolve to one new dossier.\n- The bridge is identity-only and fail-closed. World_State by itself still cannot introduce a new NPC, private chatter cannot introduce one, and an unrelated visible role does not authorize a structured name.\n- Existing new-NPC admission modes remain unchanged. Named-preferred may use the bridge because the resulting dossier still has an established proper name.\n\n## Settings organization`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.15')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.15\n\n- Fixes new-NPC admission when visible prose introduces a specific character by role while the same current World_State supplies that character\'s canonical proper name.\n- Adds a narrow role-to-World_State identity bridge so scenes such as visible \"the clerk\" plus \"Kora Lind — Guild Clerk\" create the expected dossier.\n- Keeps the structured evidence firewall intact: World_State alone, NPC_Inner_Chatter alone, and unrelated visible roles still cannot create a dossier.\n- Preserves balanced, named-preferred, and manual admission semantics; manual mode still blocks automatic new dossiers.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.15');
