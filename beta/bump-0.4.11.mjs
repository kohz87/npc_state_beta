import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.10', '0.4.11'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.10', '0.4.11'].includes(manifest.version)) throw new Error('Expected the complete 0.4.10 baseline');
manifest.version = '0.4.11';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.10', '0.4.11');
if (!readme.includes('## Scanner edge-case hardening')) {
    readme += '\n## Scanner edge-case hardening\n\nNPC State 0.4.11 hardens automatic reconciliation around malformed scanner payloads, identity collisions, life-state evidence, long canonical appearance text, cumulative visual maturation, family/manual-lock boundaries, Targeted Refresh isolation, and directional relationship evidence. Invalid foreground payloads now fail before state mutation or scan-marker advancement; automatic identity updates fail closed when a returned name/alias belongs to another dossier; death archiving requires affirmative target-attributed evidence rather than a bare death keyword; appearance synchronization compares full canonical descriptions rather than 160-character identity keys; small birthday/elapsed transitions accumulate from a persisted visual-aging baseline; family inference respects manual Key Relationship locks; Targeted Refresh discards non-target family facts; and relationship grounding uses predicate-local negation plus expected actor direction.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.11')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.11\n\n- Hardens scanner invariants: malformed/structurally invalid payloads fail before state mutation, automatic identity collisions fail closed, death transitions require affirmative target-attributed evidence, and durable appearance/Base synchronization compares complete canonical descriptions instead of 160-character identity keys.\n- Adds cumulative visual-aging baselines so individually small birthday/elapsed transitions can eventually satisfy ordinary or long-lived maturation thresholds without forcing a single large time skip. The baseline advances only when visible maturation is actually accepted, while age corrections reset it without aging appearance.\n- Makes family sibling/twin inference respect manual Key Relationships locks and makes Targeted Refresh an explicit allowlist that discards familyFacts and all non-target graph output.\n- Makes relationship grounding actor-aware for NPC-to-player direction and scopes negation/conflict checks to the relevant relationship predicate, preventing unrelated negation from rejecting valid trust evidence and reverse-direction statements from moving the wrong NPC meter.\n- Repairs the legacy injection-budget verifier so it checks the identity-directory slice rather than rejecting an NPC that legitimately appears in the separately budgeted dossier section.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.11');
