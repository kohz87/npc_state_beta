import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const startMarker = 'function relationshipAxisLooksDuplicate(npc, change, axis, { sourceMessageId = null, turn = null } = {}) {';
const endMarker = 'function relationshipEvidenceSourcesForOptions(options = {}) {';
if (!source.includes('function relationshipDuplicateEvidenceKey')) {
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
    if (start < 0 || end < 0) throw new Error('Missing v0.4.20 duplicate helper section');
    const replacement = `function relationshipDuplicateEvidenceKey(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\\r\\n?/g, '\\n')
        .replace(/\\s+/g, ' ')
        .trim()
        .toLocaleLowerCase()
        .slice(0, 2400);
}

function relationshipAxisLooksDuplicate(npc, change, axis, { sourceMessageId = null, turn = null } = {}) {
    const currentEvidence = relationshipDuplicateEvidenceKey(relationshipAxisEvidenceText(change, axis));
    const history = normalizeRelationshipEvidenceHistory(npc?.relationshipEvidenceHistory);
    return history.some(previous => {
        if (Number.isInteger(sourceMessageId) && Number.isInteger(previous.sourceMessageId)
            && previous.sourceMessageId === sourceMessageId) return true;
        if (Number.isInteger(turn) && Number.isInteger(previous.turn) && previous.turn === turn) return true;
        if (!currentEvidence) return false;
        const previousEvidence = relationshipDuplicateEvidenceKey(
            (previous.axisEvidence?.[axis]?.excerpts || []).join(' ') || previous.evidence,
        );
        return Boolean(previousEvidence && previousEvidence === currentEvidence);
    });
}

`;
    source = source.slice(0, start) + replacement + source.slice(end);
    fs.writeFileSync(path, source);
}

console.log('Hardened NPC State 0.4.20 exact-evidence idempotency');
