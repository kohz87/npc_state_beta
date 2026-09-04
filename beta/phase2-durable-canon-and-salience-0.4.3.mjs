import fs from 'node:fs';

const scannerPath = 'v03/scanner.js';
let scanner = fs.readFileSync(scannerPath, 'utf8');
function replaceScanner(from, to, label) {
    if (!scanner.includes(from)) throw new Error('Missing Phase 2 scanner marker: ' + label);
    scanner = scanner.replace(from, to);
}

replaceScanner(
`function applyStablePatch(npc, patch, options = {}) {
`,
`const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role']);
const CANON_CORRECTION_CUES = /\\b(actually|correction|corrected|mistaken|mistake|wrong|misidentified|misstated|in fact|rather than|true (?:species|identity|origin))\\b/i;
const CANON_REVELATION_CUES = /\\b(reveal(?:s|ed)?|turns out|true (?:species|identity|origin)|secretly|had always been|was born|comes from|originally from|confesses?|admits?)\\b/i;
const CANON_ROLE_CHANGE_CUES = /\\b(promot(?:ed|ion)|demot(?:ed|ion)|appointed|assigned|reassigned|retired|resigned|dismissed|became|becomes|now serves?|takes? the role|takes? over as|elected|installed as)\\b/i;
const CANON_APPEARANCE_CHANGE_CUES = /\\b(permanent(?:ly)?|lasting|scar(?:red|ring)?|lost|gained|grew|growth|cut (?:her|his|their) hair|hair (?:was|is) cut|dyed|tattoo(?:ed)?|branded|aged|rejuvenat(?:ed|ion)|transformed permanently|body changed|now has|no longer has)\\b/i;
const CANON_SPECIES_CHANGE_CUES = /\\b(became|becomes|transformed into|turned into|reborn as|ascended into|changed species|permanently transformed)\\b/i;

function canonChangeForField(patch, field) {
    if (!DURABLE_CANON_FIELDS.has(field)) return null;
    return (Array.isArray(patch?.canonChanges) ? patch.canonChanges : []).find(raw =>
        raw && typeof raw === 'object' && !Array.isArray(raw) && String(raw.field || '').trim() === field) || null;
}

function durableCanonDecision(npc, patch, field, incomingValue, options = {}) {
    const incoming = String(incomingValue ?? '').trim();
    const current = String(npc?.[field] ?? '').trim();
    if (!incoming) return false;
    if (options.isBootstrap === true || !current) return true;
    if (normalizeName(incoming) === normalizeName(current)) return false;
    const change = canonChangeForField(patch, field);
    if (!change) return false;
    const value = String(change.value ?? change[field] ?? incoming).trim();
    const evidence = String(change.evidence || change.reason || '').trim().slice(0, 700);
    const mode = String(change.mode || '').trim().toLocaleLowerCase();
    const context = String(options.profileContext || '');
    if (!value || normalizeName(value) !== normalizeName(incoming) || !evidence || !profileEvidenceGrounded(evidence, context)) return false;
    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'revelation') return CANON_REVELATION_CUES.test(evidence + ' ' + context);
        if (mode === 'change') return CANON_SPECIES_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }
    if (field === 'role') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'change') return CANON_ROLE_CHANGE_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        return false;
    }
    if (field === 'appearance') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        if (mode === 'change') return CANON_APPEARANCE_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }
    if (field === 'background') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'revelation') return CANON_REVELATION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        return false;
    }
    return false;
}

function applyStablePatch(npc, patch, options = {}) {
`,
'durable canon helpers');

replaceScanner(
`    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'background'];
`,
`    const stringFields = ['name', 'age', 'apparentAge'];
`,
'legacy scalar field list');

replaceScanner(
`    if (!locked.has('age')) {
        const changedAge = explicitAgeChange(npc, patch, options);
        if (changedAge) next.age = changedAge;
    }
`,
`    if (!locked.has('age')) {
        const changedAge = explicitAgeChange(npc, patch, options);
        if (changedAge) next.age = changedAge;
    }
    for (const field of ['role', 'species', 'background']) {
        if (locked.has(field)) continue;
        const value = String(patch?.[field] ?? '').trim();
        if (durableCanonDecision(npc, patch, field, value, options)) next[field] = value;
    }
`,
'durable scalar application');

replaceScanner(
`        // Non-transforming NPCs keep the legacy behavior. Once an NPC is form-aware,
        // shared appearance stops being rewritten merely because the current body changed.
        if (appearance && (!formAware || !next.appearance)) next.appearance = appearance;
`,
`        // Ordinary appearance is durable canon too. Multi-form NPCs keep the shared/base
        // summary, while non-transforming NPCs need grounded canonChanges to revise an
        // already-established body description.
        if (appearance && !next.appearance) next.appearance = appearance;
        else if (appearance && !formAware && durableCanonDecision(npc, patch, 'appearance', appearance, options)) next.appearance = appearance;
`,
'ordinary appearance stickiness');

replaceScanner(
`    if (Number.isFinite(Number(patch?.importance))) next.importance = Math.max(next.importance || 0, Math.min(100, Math.max(0, Math.round(Number(patch.importance)))));
`,
`    // importance is user/editor-owned durable prioritization. Scanner proposals are ignored;
    // runtime relevance is computed separately and never ratchets this stored value upward.
`,
'scanner importance authority');

scanner = scanner.replaceAll(
`profileChanges: [{ field: 'personality|behaviorProfile|speech|mannerisms', mode: 'refine|gradual|explicit|batch', concept: 'short stable concept label', evidence: 'grounded evidence for this durable profile update' }], background: '',`,
`profileChanges: [{ field: 'personality|behaviorProfile|speech|mannerisms', mode: 'refine|gradual|explicit|batch', concept: 'short stable concept label', evidence: 'grounded evidence for this durable profile update' }], canonChanges: [{ field: 'appearance|species|background|role', mode: 'refine|change|correction|revelation', value: 'replacement durable canon', evidence: 'grounded evidence for this durable scalar revision' }], background: '',`
);

replaceScanner(
`        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',
`,
`        '- Stable scalar profile fields should contain only newly established or clearly supported facts. Omit/empty scalar fields rather than guessing.',
        '- DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. Do not restate them with a different value merely because wording drifts. Any real revision must include canonChanges with the same field/value plus grounded evidence. appearance refine adds compatible lasting detail; appearance change needs a lasting physical change; species accepts explicit correction/revelation or a genuine permanent species change; background accepts grounded refinement/revelation/correction; role change needs an actual promotion/reassignment/retirement/etc. Scanner importance is non-authoritative and must not be used to raise dossier priority.',
`,
'recovery durable scalar canon prompt');

replaceScanner(
`        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',
`,
`        'DURABLE PROFILE EVOLUTION: for established personality/behaviorProfile/speech/mannerisms, include a profileChanges entry only when the supplied chat actually supports refine, gradual, explicit, or batch development. refine must remain compatible with existing identity; gradual requires repeated same-concept evidence; explicit requires a lasting/correction cue; batch requires a real narrated time skip. One-off gestures are not mannerisms. Sparse blank fields may be seeded when the evidence directly establishes them.',
        'DURABLE SCALAR CANON: preserve established ordinary Appearance, Species, Background, and Role unless this window explicitly supports a canonChanges revision. Use canonChanges with field/value/evidence and mode refine|change|correction|revelation. Never use scanner importance to reprioritize the dossier.',
`,
'targeted refresh durable scalar prompt');

// Targeted refresh output contract is a large inline JSON template. Add the generic channel
// beside profileChanges without changing legacy scalar fields.
scanner = scanner.replaceAll(
`mannerisms: null, profileChanges: null, background: '',`,
`mannerisms: null, profileChanges: null, canonChanges: null, background: '',`
);

fs.writeFileSync(scannerPath, scanner);

let injection = fs.readFileSync('v03/injection.js', 'utf8');
function replaceInjection(from, to, label) {
    if (!injection.includes(from)) throw new Error('Missing Phase 2 injection marker: ' + label);
    injection = injection.replace(from, to);
}
replaceInjection(
`function activeCandidates(state, limit) {
    const activeIds = new Set([...(state?.lastObservation?.exchangeActiveNpcIds || []), ...(state?.lastObservation?.finalPresentNpcIds || []), ...(state?.lastObservation?.worldActiveNpcIds || [])]);
    return (state?.npcs || []).filter(npc => !npc.archived).sort((a, b) => {
        const ap = (a.present ? 8 : 0) + (a.worldActive ? 4 : 0) + (activeIds.has(a.id) ? 3 : 0);
        const bp = (b.present ? 8 : 0) + (b.worldActive ? 4 : 0) + (activeIds.has(b.id) ? 3 : 0);
        return bp - ap || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1) || Number(b.importance || 0) - Number(a.importance || 0);
    }).slice(0, limit);
}
`,
`export function runtimeNpcSalience(npc, state = {}) {
    const activeIds = new Set([...(state?.lastObservation?.exchangeActiveNpcIds || []), ...(state?.lastObservation?.finalPresentNpcIds || []), ...(state?.lastObservation?.worldActiveNpcIds || [])]);
    return (npc?.present ? 1000 : 0)
        + (npc?.worldActive ? 400 : 0)
        + (activeIds.has(npc?.id) ? 300 : 0)
        + Math.max(0, Math.min(100, Number(npc?.importance) || 0));
}

function activeCandidates(state, limit) {
    return (state?.npcs || []).filter(npc => !npc.archived).sort((a, b) =>
        runtimeNpcSalience(b, state) - runtimeNpcSalience(a, state)
        || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1)
        || Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    ).slice(0, limit);
}
`,
'computed runtime salience');

replaceInjection(
`        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',
`,
`        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',
        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, and Role are sticky. If one truly changes, return canonChanges with field, mode refine|change|correction|revelation, the same replacement value, and concrete current-exchange evidence. Appearance change requires lasting physical change, Species requires explicit correction/revelation or genuine permanent transformation, Background requires grounded refinement/revelation/correction, and Role changes only on an actual promotion/reassignment/retirement/etc. importance is user/editor-owned and scanner importance is ignored.',
`,
'foreground durable scalar canon rule');

injection = injection.replaceAll(
`"mannerisms":[],"profileChanges":[{"field":"personality|behaviorProfile|speech|mannerisms","mode":"refine|gradual|explicit|batch","concept":"short stable concept","evidence":"grounded durable-change evidence"}],"background":""`,
`"mannerisms":[],"profileChanges":[{"field":"personality|behaviorProfile|speech|mannerisms","mode":"refine|gradual|explicit|batch","concept":"short stable concept","evidence":"grounded durable-change evidence"}],"canonChanges":[{"field":"appearance|species|background|role","mode":"refine|change|correction|revelation","value":"replacement durable canon","evidence":"grounded scalar-change evidence"}],"background":""`
);
fs.writeFileSync('v03/injection.js', injection);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 2 makes ordinary Appearance, Species, Background, and Role durable scalar canon with an explicit evidence-backed canonChanges revision channel. Scanner-supplied importance can no longer ratchet dossier priority upward; stored importance remains user/editor-owned while foreground selection uses computed runtime salience from In-chat/current activity plus that manual preference.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 2 durable scalar canon and computed salience');
