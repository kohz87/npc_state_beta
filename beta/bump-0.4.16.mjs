import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.16 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.15', '0.4.16'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.15', '0.4.16'].includes(manifest.version)) throw new Error('Expected the complete 0.4.15 baseline');
manifest.version = '0.4.16';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.15', '# NPC State Beta 0.4.16', 'README title');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.15 clones', 'On first load for a chat with no beta sidecar, 0.4.16 clones');
readme = readme.replace('its v0.4.15 meaning is **in chat**', 'its v0.4.16 meaning is **in chat**');
if (!readme.includes('## Relationship evidence grounding')) {
    readme = readme.replace(
        '## Relationship milestone gate invariants',
        `## Relationship evidence grounding\n\n- v0.4.16 keeps strict target-direction and polarity checks, but ordinary Trust evidence no longer depends only on near-verbatim token overlap with one narration clause.\n- A narrow semantic fallback can ground a small Trust change when the scanner paraphrases a clearly player-attributed task result, such as reliable bounty completion, timely delivery, competent work, or a fulfilled responsibility. The original lexical grounding path remains the first choice.\n- The fallback is fail-closed: it applies only to ordinary single-axis Trust movement, requires a player-attributed concrete event, rejects conflicting/failed performance, does not weaken Desire evidence, and does not relax meaningful/major/extreme relationship gates.\n\n## Relationship milestone gate invariants`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.16')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.16\n\n- Fixes ordinary Trust changes being rejected as `ungrounded` when the scanner described a real current-exchange event with a reasonable paraphrase instead of reusing the narration\'s exact words.\n- Adds a narrow semantic grounding fallback for player-attributed task completion, timely delivery, competent execution, and reliability evidence while preserving the existing lexical match path.\n- Keeps actor-direction, polarity, Desire, milestone, and higher-impact evidence protections unchanged; unrelated NPC performance, passive task completion, failed work, and generic praise still fail closed.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.16');
