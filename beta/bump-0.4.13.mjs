import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.12', '0.4.13'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.12', '0.4.13'].includes(manifest.version)) throw new Error('Expected the complete 0.4.12 baseline');
manifest.version = '0.4.13';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.12', '0.4.13');
if (!readme.includes('## Semantic evidence isolation')) {
    readme += '\n## Semantic evidence isolation\n\nNPC State 0.4.13 binds destructive life-state transitions and relationship movement to the actual target predicate instead of accepting nearby names or cue words. Death and living-return evidence now resolve the tracked NPC specifically, preserve possessive boundaries, scope negation/modality to the target assertion, and ignore another character\'s survival or resurrection. Relationship evidence binds each directional predicate to its nearest named actor and evaluates polarity within the predicate rather than a broad token window. Scanner dossier identities are strongly typed strings at the payload boundary. Structured dossier import now disables global family reconciliation, matching Targeted Refresh isolation. The release build also persists the legacy verifier compatibility fixtures used by CI so a fresh checkout runs the same test surface as the build pipeline.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.13')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.13\n\n- Binds death and resurrection evidence to the tracked NPC and the matched life-state predicate. Possessive references such as "Mira\'s attacker" no longer identify Mira as the victim, another NPC\'s survival no longer cancels Mira\'s death, and negated/other-person alive statements cannot resurrect an archived dossier.\n- Replaces whole-evidence relationship actor checks with predicate-local nearest-actor binding, so mentioning Mira before a later Sora-to-player trust predicate cannot move Mira\'s relationship state.\n- Narrows relationship polarity handling to the relevant predicate and adds composite decrease handling such as "tension easing", while preserving legitimate statements such as "no longer afraid and trusts Lucien" and "less trusting".\n- Requires scanner NPC id/name/alias identity values to be actual strings rather than stringifying nested objects or other invalid types.\n- Makes Structured Dossier Import skip global family reconciliation, preventing an import for one NPC from mutating unrelated family dossiers or graph edges.\n- Persists the forward-compatible verifier fixtures used during release builds so a fresh checkout and CI execute the same regression suite without hidden test-source rewrites.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.13');
