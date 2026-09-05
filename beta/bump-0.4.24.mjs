import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.24 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.23', '0.4.24'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.23', '0.4.24'].includes(manifest.version)) throw new Error('Expected the complete 0.4.23 baseline');
manifest.version = '0.4.24';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.23', '# NPC State Beta 0.4.24', 'README title');
readme = readme.replace('its v0.4.23 meaning is **in chat**', 'its v0.4.24 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.23 clones', 'On first load for a chat with no beta sidecar, 0.4.24 clones');
readme = readme.replace('v0.4.23 applies one shared relationship-judgment rubric', 'v0.4.24 applies one shared relationship-judgment rubric');
if (!readme.includes('## Presence grounding')) {
    readme = readme.replace(
        '## Relationship prompt alignment',
        `## Presence grounding\n\n- Existing multi-part NPC names may be grounded by an unambiguous visible short-name token when the scanner returns that established NPC as exchange-active or in-chat. For example, visible \"Brina\" can ground the existing dossier \"Brina Cole\" even when World_State uses the full name.\n- Short-name grounding is fail-closed when the token is shared by another stored NPC identity, is generic/common control language, or appears only in World_State/private/reference blocks. The structured-evidence firewall remains authoritative: World_State alone still does not prove in-chat presence.\n- This fixes off-screen-to-present transitions that were previously discarded after a correct scanner result because visible prose used a first name while structured context used the full canonical name.\n\n## Relationship prompt alignment`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.24')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.24\n\n- Fixes existing NPCs remaining off-screen when visible narrative uses an unambiguous short name such as `Brina` while the canonical dossier/World_State uses `Brina Cole`.\n- Grounds short-name activity only for established multi-part identities and only when the short token is unique across stored NPC names/aliases; ambiguous/shared or generic tokens fail closed.\n- Preserves the structured-evidence firewall: World_State and NPC_Inner_Chatter alone still cannot establish in-chat presence, and no relationship, profile, life-state, or scoring mechanics are changed.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.24');
