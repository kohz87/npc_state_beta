import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.19 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.18', '0.4.19'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.18', '0.4.19'].includes(manifest.version)) throw new Error('Expected the complete 0.4.18 baseline');
manifest.version = '0.4.19';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.18', '# NPC State Beta 0.4.19', 'README title');
readme = readme.replace('its v0.4.18 meaning is **in chat**', 'its v0.4.19 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.18 clones', 'On first load for a chat with no beta sidecar, 0.4.19 clones');
if (!readme.includes('## Per-axis relationship grounding')) {
    readme = readme.replace(
        '## Relationship evidence grounding',
        `## Per-axis relationship grounding\n\n- v0.4.19 grounds each proposed Trust, Affection, Desire, and Tension movement independently instead of rejecting a whole multi-axis relationship change when one axis is weak.\n- Unsupported or polarity-conflicting axes are discarded individually. Grounded axes continue through the existing impact axis-limit, duplicate protection, inertia curve, and milestone gates. Diagnostics preserve the original proposal and identify rejected axes, while accepted subsets are marked \`partial-applied\`.\n- Desire keeps its explicit-evidence safeguards and remains outside broad semantic performance inference. A weak Desire proposal cannot suppress an independently grounded Trust, Affection, or Tension change.\n\n## Relationship evidence grounding`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.19')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.19\n\n- Grounds multi-axis relationship proposals per axis so one unsupported axis no longer invalidates otherwise grounded movement.\n- Preserves grounded subsets through existing axis limits, inertia, fractional progress, milestone gates, duplicate protection, and relationship history.\n- Adds axis-specific rejection diagnostics and `partial-applied` visibility while retaining the original scanner proposal for auditability.\n- Keeps Desire explicit-only and prevents unsupported Desire from poisoning valid Trust, Affection, or Tension changes.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.19');
