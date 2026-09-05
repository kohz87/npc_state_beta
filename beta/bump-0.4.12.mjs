import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.11', '0.4.12'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.11', '0.4.12'].includes(manifest.version)) throw new Error('Expected the complete 0.4.11 baseline');
manifest.version = '0.4.12';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.11', '0.4.12');
if (!readme.includes('## Second-order scanner hardening')) {
    readme += '\n## Second-order scanner hardening\n\nNPC State 0.4.12 closes follow-on edge cases discovered after the 0.4.11 scanner pass. Scanner observations now validate member types transactionally even when passed as already-parsed objects; same-observation identity reservations prevent two pending renames from claiming the same canonical identity; death archiving requires a completed assertion that the tracked NPC is actually the victim rather than merely appearing near a death verb; directional relationship evidence rejects another known NPC as the experiencer and relationship delta polarity must agree with locally negated predicates. Timeline rebase now treats manual relationship edits as chronological anchors instead of shielding an entire axis, so later discarded automatic gains roll back without undoing the manual value. Manual Actual/Apparent Age edits reset the maturation baseline, and Targeted Refresh disables global family reconciliation so unrelated dossiers cannot change as a side effect.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.12')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.12\n\n- Makes scanner validation transactional for both JSON text and already-parsed objects: activity arrays require non-empty strings, dossier/edge/family arrays require valid object members, malformed members reject the whole observation, and pending same-scan identity changes reserve names/aliases before any state mutation.\n- Tightens death archiving to completed target-specific assertions. A tracked NPC is no longer archived merely because its name appears near another character being killed or a hypothetical/future death statement.\n- Tightens relationship evidence ownership and polarity: evidence naming another known NPC as the experiencer fails closed, directional actor checks remain local to the predicate, and negated love/trust/desire/tension evidence cannot authorize a delta with the opposite sign.\n- Reworks relationship rebase rollback so post-divergence manual score edits are chronological anchors rather than whole-axis shields. Discarded automatic movement after the latest manual anchor rolls back while automatic movement that the manual edit already overwrote is not subtracted twice.\n- Resets cumulative visual-maturation provenance after manual Actual Age or Apparent Age edits, preventing stale historical baselines from authorizing oversized future visual-age jumps.\n- Makes Targeted Refresh skip global family reconciliation entirely, preventing existing family slots from mutating unrelated dossiers or graph edges during a single-NPC refresh.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.12');
