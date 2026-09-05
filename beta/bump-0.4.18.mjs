import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.18 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.17', '0.4.18'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.17', '0.4.18'].includes(manifest.version)) throw new Error('Expected the complete 0.4.17 baseline');
manifest.version = '0.4.18';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.17', '# NPC State Beta 0.4.18', 'README title');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.17 clones', 'On first load for a chat with no beta sidecar, 0.4.18 clones');
readme = readme.replace('its v0.4.17 meaning is **in chat**', 'its v0.4.18 meaning is **in chat**');
if (!readme.includes('## Relationship evaluation observability')) {
    readme = readme.replace(
        '## Relationship evidence grounding',
        `## Relationship evaluation observability\n\n- v0.4.18 requires an explicit relationship evaluation for every exchange-active NPC. A scanner may still correctly decide that an ordinary interaction causes no relationship movement, but it must say so instead of silently omitting the relationship channel.\n- A deliberate zero is recorded only in the bounded relationship diagnostics as \`evaluated-no-change\`; it does not create relationship history, evidence history, fractional progress, or score movement. If an exchange-active NPC is returned without the required evaluation, diagnostics record \`evaluation-missing\` instead. Malformed attempted evaluations are recorded as \`evaluation-invalid\`.\n- This keeps routine scenes from inflating relationship history while making \"evaluated and unchanged\" distinguishable from \"scanner forgot to evaluate\". Rescans with relationship application disabled do not add duplicate evaluation telemetry.\n\n## Relationship evidence grounding`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.18')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.18\n\n- Requires explicit player-relationship evaluation for every exchange-active NPC, including deliberate no-change results.\n- Records bounded diagnostic telemetry for `evaluated-no-change`, `evaluation-missing`, and `evaluation-invalid` without polluting actual relationship history or changing scores.\n- Makes foreground and recovery scanner prompts require `relationshipChange.evaluated: true` and a concise reason when impact is `none`.\n- Keeps existing relationship grounding, progression inertia, milestone gates, Desire isolation, and rescan duplicate-safety behavior unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.18');
