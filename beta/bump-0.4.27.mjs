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
if (!readme.includes('## Source-agnostic identity and presence grounding')) {
    readme = readme.replace(
        '## General kinship projection',
        `## Source-agnostic identity and presence grounding\n\n- Current visible narrative is the primary source for new-NPC identity and scene participation. The scanner may bind indirect descriptions, pronouns, scene continuity, and earlier named references semantically, while runtime verifies quoted current-visible provenance instead of adding keyword/role classifiers.\n- New-NPC proposals may carry \`identityEvidence\`; activity claims may carry per-channel \`activityEvidence\` for exchange-active, in-chat, and world-active classification. These fields are transient scan evidence and do not rewrite saved dossier schema.\n- Megumin-style \`World_State\` is optional corroboration only. When present, NPCs Present and Off-Screen sections are separated so a present NPC cannot be accepted as world-active merely because their name appears somewhere in World_State. A public short-name anchor may be enriched to a unique compatible structured full name, but structured-only names still cannot create dossiers.\n- In-chat and world-active are mutually exclusive final states. When a malformed scan claims both for one NPC and current-visible evidence supports in-chat, in-chat wins. Existing score, relationship, family, history, and progression mechanics are unchanged.\n\n## General kinship projection`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.27')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.27\n\n- Makes new-NPC identity and presence grounding source-agnostic: plain visible narrative is sufficient, with exact current-visible identity/activity evidence available for indirect semantic binding.\n- Separates Megumin World_State NPCs Present and Off-Screen corroboration so names listed as present cannot be accepted as off-screen world activity merely because they occur somewhere in the structured block.\n- Allows a publicly grounded short proper-name anchor to enrich to one unique compatible World_State canonical name while continuing to reject structured-only identities, ambiguous anchors, private-only references, and unsupported surnames.\n- Makes in-chat and world-active mutually exclusive final states, preserves the v0.4.24 short-name bridge, and leaves relationship scoring/progression, family projection, saved state, and historical scores unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.27');
