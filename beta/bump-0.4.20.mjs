import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.20 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.19', '0.4.20'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.19', '0.4.20'].includes(manifest.version)) throw new Error('Expected the complete 0.4.19 baseline');
manifest.version = '0.4.20';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.19', '# NPC State Beta 0.4.20', 'README title');
readme = readme.replace('its v0.4.19 meaning is **in chat**', 'its v0.4.20 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.19 clones', 'On first load for a chat with no beta sidecar, 0.4.20 clones');
if (!readme.includes('## Evidence-backed relationship judgment')) {
    readme = readme.replace(
        '## Per-axis relationship grounding',
        `## Evidence-backed relationship judgment\n\n- v0.4.20 makes the scanner model responsible for interpreting relationship meaning and makes deterministic runtime validation responsible for provenance, structure, limits, duplicate application, inertia, and milestone gates.\n- Every nonzero Trust, Affection, Desire, or Tension proposal now carries its own exact current-exchange excerpt(s) plus a concise explanation. Runtime verifies those quotations against bounded visible/private relationship sources without using keyword overlap as a semantic veto.\n- Structured World_State and reference/control blocks remain outside ordinary relationship-event evidence. Existing saves remain readable; legacy nonzero scanner payloads without the new per-axis evidence contract are diagnosed and rejected rather than silently authorized.\n- Impact-tier axis limits remain unchanged. Scanner-provided axis priority resolves supported overflow first; legacy proposals with valid per-axis evidence fall back deterministically to magnitude, then Trust → Affection → Desire → Tension.\n\n## Per-axis relationship grounding`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.20')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.20\n\n- Replaces runtime keyword/overlap relationship-semantic vetoes with a bounded per-axis evidence contract: exact current-exchange excerpts plus model-authored explanations.\n- Verifies quotation provenance against visible narrative and permitted private relationship context while keeping World_State and reference/control blocks out of unrestricted relationship evidence.\n- Preserves score bounds, configured caps, inertia, fractional progress, milestone gates, manual edits, branch/rebase behavior, and unrelated-NPC safeguards.\n- Fixes tied axis-limit overflow using validated model priority with deterministic magnitude/canonical fallback, and records precise per-axis provenance, cap, duplicate, gate, and axis-limit diagnostics.\n- Keeps legacy saves compatible without rewriting historical scores; legacy nonzero scanner payloads that lack per-axis evidence are rejected safely instead of being semantically guessed by runtime.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.20');
