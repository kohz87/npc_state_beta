import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.27 activity compatibility marker: ' + label);
    return source.replace(from, to);
}

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');

source = replaceRequired(
    source,
    `function activityPatchForReference(state, reference, patches = []) {`,
    `function relationshipChangeCurrentEvidenceVerified(patch, visibleText = '') {
    const change = patch?.relationshipChange;
    if (!change || typeof change !== 'object' || Array.isArray(change)) return false;
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(change?.delta?.[axis])) continue;
        const record = change?.axisEvidence?.[axis];
        if (record && verifiedCurrentVisibleExcerpts(record, visibleText)) return true;
    }
    return false;
}
function activityPatchForReference(state, reference, patches = []) {`,
    'relationship evidence activity compatibility helper',
);

source = replaceRequired(
    source,
    `    if (patch && activityEvidenceVerified(patch, channel, visible)) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));`,
    `    if (patch && activityEvidenceVerified(patch, channel, visible)) return true;
    // A valid nonzero relationship proposal already carries exact CURRENT-visible evidence.
    // Let that evidence prove exchange participation as well so identity/presence hardening
    // cannot suppress otherwise-valid relationship scoring merely because an older model or
    // deterministic fixture omitted the newer activityEvidence field.
    if (channel === 'exchangeActive' && patch && relationshipChangeCurrentEvidenceVerified(patch, visible)) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));`,
    'relationship evidence exchange-active fallback',
);

source = replaceRequired(
    source,
    `    return {
        present: values.some(value => containsNormalizedPhrase(policy?.worldPresentText || '', value)),
        offscreen: values.some(value => containsNormalizedPhrase(policy?.worldOffscreenText || '', value)),
    };`,
    `    const present = values.some(value => containsNormalizedPhrase(policy?.worldPresentText || '', value));
    const offscreen = values.some(value => containsNormalizedPhrase(policy?.worldOffscreenText || '', value));
    const hasPlacementSections = Boolean(String(policy?.worldPresentText || '').trim() || String(policy?.worldOffscreenText || '').trim());
    const legacyWorld = !hasPlacementSections && values.some(value => containsNormalizedPhrase(policy?.worldStateText || '', value));
    return { present, offscreen, legacyWorld };`,
    'World_State legacy unsectioned classification',
);

source = replaceRequired(
    source,
    `    if (sections.present && !sections.offscreen) return false;
    if (sections.offscreen) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;`,
    `    if (sections.present && !sections.offscreen) return false;
    if (sections.offscreen) return true;
    // Pre-sectioned World_State formats historically used the whole block as explicit
    // off-screen live-state context. Preserve that compatibility only when no Present or
    // Off-Screen placement section exists anywhere in the current World_State.
    if (sections.legacyWorld) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;`,
    'legacy World_State off-screen authority',
);

fs.writeFileSync(path, source);
console.log('Preserved v0.4.27 relationship and legacy World_State activity compatibility');
