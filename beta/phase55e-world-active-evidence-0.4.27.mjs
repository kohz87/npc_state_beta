import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
const from = `    if (sections.legacyWorld) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));
    const shortVisible = npc ? visibleShortActivityIdentityMention(state, npc, visible) : false;
    if (exactVisible || shortVisible) return true;
    return !visible && !policy?.detected;`;
const to = `    if (sections.legacyWorld) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;
    // A visible name alone says only that the NPC was mentioned. It cannot establish that
    // the NPC is currently active somewhere off-screen. Plain-narrative worldActive claims
    // therefore require the model's exact current-visible activityEvidence. Structured
    // Off-Screen placement and legacy unsectioned World_State remain the only non-quote paths.
    return !visible && !policy?.detected;`;
if (!source.includes(to)) {
    if (!source.includes(from)) throw new Error('Missing v0.4.27 worldActive visible-name fallback');
    source = source.replace(from, to);
}
fs.writeFileSync(path, source);
console.log('Required explicit current evidence for plain-narrative worldActive claims');
