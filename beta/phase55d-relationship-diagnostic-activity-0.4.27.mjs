import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    if (channel === 'exchangeActive' && patch && relationshipChangeCurrentEvidenceVerified(patch, visible)) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));`;
const to = `    if (channel === 'exchangeActive' && patch && relationshipChangeCurrentEvidenceVerified(patch, visible)) return true;
    // Preserve v0.4.20 diagnostic observability for an already-present established NPC:
    // a malformed nonzero proposal must reach relationshipDeltaForPatch so it can be
    // rejected with precise reasons such as missing-axis-evidence. This fallback cannot
    // create a new NPC, cannot establish final presence, and cannot authorize movement.
    const hasRawRelationshipProposal = patch?.relationshipChange?.evaluated === true
        && RELATIONSHIP_AXES.some(axis => Number(patch?.relationshipChange?.delta?.[axis]) !== 0);
    if (channel === 'exchangeActive' && npc?.present === true && hasRawRelationshipProposal) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));`;
if (!source.includes(to)) {
    if (!source.includes(from)) throw new Error('Missing relationship evidence exchange-active fallback');
    source = source.replace(from, to);
}
fs.writeFileSync(path, source);
console.log('Preserved v0.4.20 malformed relationship diagnostic observability under v0.4.27');
