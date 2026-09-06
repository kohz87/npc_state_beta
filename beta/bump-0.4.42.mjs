import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.42 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.41', '0.4.42'));
}

let bootstrap = fs.readFileSync('bootstrap.js', 'utf8');
bootstrap = bootstrap.replaceAll('0.4.41', '0.4.42');
fs.writeFileSync('bootstrap.js', bootstrap);

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.41', '0.4.42'].includes(manifest.version)) throw new Error('Expected the complete 0.4.41 baseline');
manifest.version = '0.4.42';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.41', '# NPC State Beta 0.4.42', 'README title');
if (!readme.includes('## Separate scan connection and completeness pass')) {
    readme = readme.replace(
        '## Settings observer and recovery UI performance',
        `## Separate scan connection and completeness pass\n\n- **NPC scan connection profile** defaults to **Current connection**, preserving prior behavior. When a supported saved SillyTavern Connection Profile is selected, every separate NPC model request uses that profile: current-cast/full scans, dossier Refresh, structured dossier generation, historical recovery/rebuild, automatic recovery scans, completeness scans, and JSON retries. Normal roleplay generation and its embedded NPC output continue using the main connection.\n- NPC State stores only the stable Connection Profile ID. Credentials remain owned by SillyTavern. If an explicitly selected profile is missing, disabled, unsupported, changes during an operation, or fails, that separate scan fails safely and does not silently fall back to the main connection.\n- **Scan after each response** is off by default. When enabled, a successful embedded update may be followed by one separate dossier-completeness request, plus the existing JSON retry if the first answer is malformed. A full recovery scan that already covered that response suppresses the redundant completeness request.\n- The completeness pass is supplemental and same-exchange-safe: it cannot apply relationship deltas, advance the narrative turn, increment seen/activity counters, run stale aging, or count the same message as a second gradual-progression observation. Omitted collections do not erase valid dossier data. Grounded lifecycle corrections and ordinary admission/canon protections still apply.\n- Completion work is bound to chat, message content, and active swipe identity. Chat/source changes, resets/rebuilds, manual scans, dossier refresh/import, and user/editor mutations invalidate a stale in-flight completeness result before it can commit. Completed outcomes are stored on the active message/swipe to deduplicate repeated completion events.\n- Choosing another model does not guarantee better completeness or lower total cost. The optional pass normally adds one model request per completed response when enabled.\n\n## Settings observer and recovery UI performance`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.42\n')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.42\n\n- Adds an optional NPC scan Connection Profile selector for all separate scanner requests and JSON retries while leaving normal roleplay generation on the main SillyTavern connection.\n- Adds an opt-in post-response dossier completeness pass, off by default, that supplements successful embedded updates and suppresses itself when a full recovery scan already covered the response.\n- Adds same-exchange safety for completeness: no relationship replay, narrative-turn advancement, stale aging, duplicate seen counters, or same-message gradual-progression credit; supplemental collections merge instead of erasing valid dossier state.\n- Adds durable per-message/swipe completion deduplication and stale-result guards for chat/source changes, reset/rebuild, manual scans, refresh/import, and concurrent user/editor mutations.\n- Missing, unsupported, changed, or failing explicitly selected Connection Profiles fail safely with no silent fallback to the main model.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.42');
