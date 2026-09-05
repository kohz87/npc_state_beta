import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.22 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.21', '0.4.22'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.21', '0.4.22'].includes(manifest.version)) throw new Error('Expected the complete 0.4.21 baseline');
manifest.version = '0.4.22';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.21', '# NPC State Beta 0.4.22', 'README title');
readme = readme.replace('its v0.4.21 meaning is **in chat**', 'its v0.4.22 meaning is **in chat**');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.21 clones', 'On first load for a chat with no beta sidecar, 0.4.22 clones');
if (!readme.includes('## Relationship judgment calibration')) {
    readme = readme.replace(
        '## Relationship history remarks',
        `## Relationship judgment calibration\n\n- v0.4.22 applies one shared relationship-judgment rubric to foreground capture and the full recovery/current-cast scanner. It distinguishes genuinely new change from continuity, binds reactions to the correct NPC and player target, supports contextual/indirect evidence without keyword gating, evaluates axes independently, weighs ambiguity without freezing, and considers mixed chronology before proposing a net change.\n- Impact caps remain maxima rather than targets. The model is instructed to choose modest raw deltas from strength, significance, and novelty, while runtime continues to apply caps, priority/axis limits, duplicate protection, inertia, fractional progress, and milestone gates exactly as before.\n- Per-axis explanations remain concise and evidence-backed. Exact quotations still come only from permitted current-exchange relationship evidence; older context can inform interpretation but never becomes fresh evidence.\n- Relationship criteria in settings are additive campaign calibration. The shared rubric and deterministic evidence/mechanics contract always remain in force. Existing user-edited criteria are preserved; only the exact previous built-in default is migrated to the shorter additive default.\n- This release changes prompt judgment/calibration only. It does not rescan, reset, backfill, or rewrite relationship scores/history.\n\n## Relationship history remarks`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.22')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.22\n\n- Adds a shared general relationship-judgment rubric across foreground capture and full recovery/current-cast scanning: new-change continuity, correct attribution, contextual inference without keyword gating, ambiguity calibration, axis independence, proportionality, mixed chronology, balanced direction, and anti-circular reasoning.\n- Keeps the exact current-exchange per-axis quotation/explanation contract while explicitly preventing prior summaries, meter values, diagnostics, and relationship history from becoming fresh evidence.\n- Makes impact caps explicit maxima rather than default targets and reminds the model not to double-apply runtime inertia/milestone reductions or inflate proposals to overcome them.\n- Preserves user-authored custom relationship criteria as additive calibration; only the exact prior built-in default migrates to a concise additive default.\n- Adds deterministic prompt-path/regression checks and varied offline evaluation fixtures with anti-freezing coverage. Numerical relationship mechanics and v0.4.21 history remarks remain unchanged.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.22');
