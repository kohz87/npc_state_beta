import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.23 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.22', '0.4.23'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.22', '0.4.23'].includes(manifest.version)) throw new Error('Expected the complete 0.4.22 baseline');
manifest.version = '0.4.23';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.22', '# NPC State Beta 0.4.23', 'README title');
readme = readme.replace('its v0.4.22 meaning is **in chat**', 'its v0.4.23 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.22 clones', 'On first load for a chat with no beta sidecar, 0.4.23 clones');
readme = readme.replace('v0.4.22 applies one shared relationship-judgment rubric', 'v0.4.23 applies one shared relationship-judgment rubric');
if (!readme.includes('## Relationship prompt alignment')) {
    readme = readme.replace(
        '## Relationship judgment calibration',
        `## Relationship prompt alignment\n\n- Recovery labels older material as continuity-only context rather than profile/memory-only. Older context may establish prior attitudes, baselines, and already-counted developments for interpretation, but quotations supporting a new relationship movement still come from permitted current-exchange evidence.\n- Foreground and recovery numeric guidance now receives the same effective relationship caps used by runtime scoring. The shared cap normalizer preserves defaults, accepts valid configured numeric caps, clamps negative caps to zero, and falls back safely for missing or invalid values. Milestone requirements, inertia, fractional progress, axis limits, priority selection, and duplicate protection are unchanged.\n- Offline relationship evaluation fixtures now include positive and negative Desire, Affection decrease, materially ambiguous attraction, and unchanged negative attitude cases. These remain evaluation-only and do not add production keywords or runtime semantic vetoes.\n\n## Relationship judgment calibration`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.23')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.23\n\n- Resolves recovery prompt ambiguity by labeling older material as continuity-only, explicitly allowing prior attitudes/baselines/already-counted developments to inform interpretation while keeping fresh relationship quotations current-exchange-only.\n- Aligns foreground and recovery relationship numeric guidance with the effective configured relationship caps through the same shared normalization used by runtime scoring. Valid configured caps keep their existing behavior; milestone gates, inertia, fractional progress, axis limits, priority selection, and duplicate protection remain unchanged.\n- Extends offline semantic evaluation coverage with Desire increases/decreases, Affection decreases, materially ambiguous attraction, and unchanged negative attitudes. No production keyword gates or runtime semantic vetoes were added.\n- Preserves v0.4.21 Recent relationship changes remarks, saved scores/history, and v0.4.22 general judgment calibration without rescanning or backfilling.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.23');
