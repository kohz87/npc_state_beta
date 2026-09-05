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
if (!readme.includes('## Scanner evidence and maturation hardening')) {
    readme += '\n## Scanner evidence and maturation hardening\n\nNPC State v0.4.11 rejects structurally invalid scanner payloads before state mutation, prevents automatic identity collisions, requires affirmative attributed death evidence, compares complete durable appearance descriptions, accumulates small age transitions from a persisted visual-maturation baseline, respects manual family relationship locks, keeps Targeted Refresh family facts target-scoped, and hardens relationship evidence for predicate-scoped negation and actor direction.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.11')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.11\n\n- Hardens scanner application against invalid payload shapes, conflicting id/name identities, negated or misattributed death evidence, long-description appearance divergence, non-accumulating maturation, family-lock bypasses, cross-target Refresh family facts, and directional/negation errors in relationship grounding. The legacy continuity-budget verifier now measures only the identity-directory section it is intended to constrain.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.11');
