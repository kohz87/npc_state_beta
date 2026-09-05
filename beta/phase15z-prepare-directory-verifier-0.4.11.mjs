import fs from 'node:fs';

// phase16-0.4.11 historically upgrades this verifier fixture. Once later releases
// commit transformed verifier fixtures for direct-checkout parity, a cold replay
// begins with the upgraded form already present. Normalize only this fixture back
// to phase16's expected input so phase16 can deterministically reproduce the same
// output. Fresh stable-era source already contains the legacy form and is untouched.
const path = 'beta/verify-0.4.1.mjs';
let source = fs.readFileSync(path, 'utf8');

const legacy = `    const prompt = buildInjection(state, { enabled: true, autoScan: false, inject: true, injectLimit: 20, injectBudgetTokens: 512 });\n    assert(prompt.includes('Campaign NPC 000'), 'Identity directory unexpectedly empty');\n    assert(!prompt.includes('Campaign NPC 399'), 'Identity directory ignored the configured continuity budget');`;
const upgraded = `    const prompt = buildInjection(state, { enabled: true, autoScan: false, inject: true, injectLimit: 20, injectBudgetTokens: 512 });\n    const directoryStart = prompt.indexOf('KNOWN NPC DIRECTORY');\n    const dossierStart = prompt.indexOf('FULL CONTINUITY FOR LIKELY RELEVANT NPCS:');\n    const directorySection = prompt.slice(directoryStart, dossierStart >= 0 ? dossierStart : prompt.length);\n    assert(directorySection.includes('Campaign NPC 000'), 'Identity directory unexpectedly empty');\n    assert(!directorySection.includes('Campaign NPC 399'), 'Identity directory ignored the configured continuity budget');`;

if (source.includes(upgraded)) {
    source = source.replace(upgraded, legacy);
    fs.writeFileSync(path, source);
    console.log('Prepared committed directory-budget verifier for deterministic v0.4.11 replay');
} else if (source.includes(legacy)) {
    console.log('Directory-budget verifier is already in the v0.4.11 pre-transform form');
} else {
    throw new Error('Unable to identify the v0.4.11 directory-budget verifier fixture');
}
