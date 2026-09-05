import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.27 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.26', '0.4.27'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.26', '0.4.27'].includes(manifest.version)) throw new Error('Expected the complete 0.4.26 baseline');
manifest.version = '0.4.27';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.26', '# NPC State Beta 0.4.27', 'README title');
readme = readme.replace('its v0.4.26 meaning is **in chat**', 'its v0.4.27 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.26 clones', 'On first load for a chat with no beta sidecar, 0.4.27 clones');
readme = readme.replace('v0.4.26 applies one shared relationship-judgment rubric', 'v0.4.27 applies one shared relationship-judgment rubric');
if (!readme.includes('## Section-aware World_State presence')) {
    readme = readme.replace(
        '## World-state identity bridge',
        `## Section-aware World_State presence\n\n- World_State activity is now section-aware. Only entries under the explicit Off-Screen section may corroborate worldActiveNpcIds; NPCs Present can corroborate canonical identity/location but can never by itself mark an NPC off-screen.\n- A current NPCs Present entry may bridge a canonical full name to a unique short personal name that is independently present in public narration, such as visible \`Clara\` plus structured \`Clara Vane\`. This identity bridge remains fail-closed on ambiguous short names.\n- World_State alone, NPC_Inner_Chatter, reference/control blocks, and structured-only child names still cannot create a dossier or prove in-chat participation.\n\n## World-state identity bridge`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.27')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.27\n\n- Makes World_State activity validation section-aware so NPCs Present cannot be mistaken for off-screen world activity; only the explicit Off-Screen section can corroborate worldActiveNpcIds when World_State is available.\n- Extends the new-NPC identity bridge so a unique public short personal name can resolve to the canonical full name supplied under current World_State NPCs Present, fixing scenes such as visible Clara plus structured Clara Vane without admitting structured-only names.\n- Preserves the structured-evidence firewall, existing short-name presence repair, general kinship projection, relationship scoring/progression, saved state, and all admission modes.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.27');
