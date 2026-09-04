import fs from 'node:fs';

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8HA scanner marker: ' + label);
    source = source.replace(from, to);
}

rep(
`    STABLE_PROFILE_FIELDS,
    applyRelationshipMilestoneCrossings,`,
`    STABLE_PROFILE_FIELDS,
    applyBirthdayFill,
    applyRelationshipMilestoneCrossings,`,
'birthday fill import');
rep(
`    normalizeApparentAge,
    normalizeCurrentStatus,`,
`    normalizeApparentAge,
    normalizeBirthday,
    normalizeBirthdayProvenance,
    normalizeCurrentStatus,`,
'birthday normalizers');
rep(
`        age: npc.age,
        apparentAge: npc.apparentAge,
        appearance: npc.appearance,`,
`        age: npc.age,
        apparentAge: npc.apparentAge,
        birthday: npc.birthday,
        birthdayProvenance: npc.birthdayProvenance,
        appearance: npc.appearance,`,
'roster birthday context');
rep(
`const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role']);`,
`const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role', 'birthday']);
const BIRTHDAY_EVIDENCE_CUES = /\\b(?:birthday|birth date|date of birth|born(?:\\s+on)?|name day|nameday)\\b/i;
function birthdayEvidenceGrounded(value, context) {
    const birthday = normalizeBirthday(value);
    const source = String(context || '');
    return Boolean(birthday && source.trim() && BIRTHDAY_EVIDENCE_CUES.test(source) && profileEvidenceGrounded(birthday, source));
}`,
'birthday durable canon');
rep(
`    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);`,
`    if (field === 'birthday') {
        return mode === 'correction' && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }
    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);`,
'birthday correction authority');
rep(
`    if (!locked.has('apparentAge')) {
        const apparent = normalizeApparentAge(patch?.apparentAge);
        const currentApparent = normalizeApparentAge(next.apparentAge);
        if (apparent && !currentApparent) next.apparentAge = apparent;
        else if (apparent && apparent === currentApparent) next.apparentAge = apparent;
        else if (apparent && apparentAgeProgressionAllowed(npc, apparent, ageProgression)) next.apparentAge = apparent;
    }
    for (const field of ['role', 'species', 'background']) {`,
`    if (!locked.has('apparentAge')) {
        const apparent = normalizeApparentAge(patch?.apparentAge);
        const currentApparent = normalizeApparentAge(next.apparentAge);
        if (apparent && !currentApparent) next.apparentAge = apparent;
        else if (apparent && apparent === currentApparent) next.apparentAge = apparent;
        else if (apparent && apparentAgeProgressionAllowed(npc, apparent, ageProgression)) next.apparentAge = apparent;
    }
    if (!locked.has('birthday')) {
        const incomingBirthday = normalizeBirthday(patch?.birthday);
        const currentBirthday = normalizeBirthday(npc?.birthday);
        const currentProvenance = normalizeBirthdayProvenance(npc?.birthdayProvenance, currentBirthday);
        const groundedBirthday = incomingBirthday && birthdayEvidenceGrounded(incomingBirthday, String(options.profileContext || ''));
        if (groundedBirthday && (options.isBootstrap === true || !currentBirthday || currentProvenance === 'generated')) {
            next.birthday = incomingBirthday;
            next.birthdayProvenance = 'explicit';
        } else if (incomingBirthday && currentBirthday && normalizeName(incomingBirthday) !== normalizeName(currentBirthday)
            && durableCanonDecision(npc, patch, 'birthday', incomingBirthday, options)) {
            next.birthday = incomingBirthday;
            next.birthdayProvenance = 'explicit';
        } else if (groundedBirthday && normalizeName(incomingBirthday) === normalizeName(currentBirthday) && currentProvenance === 'generated') {
            next.birthdayProvenance = 'explicit';
        }
    }
    for (const field of ['role', 'species', 'background']) {`,
'apply stable birthday');
rep(
`    state.npcs = familyReconciled.npcs;
    state.socialGraph = familyReconciled.socialGraph;
    state.familySlots = familyReconciled.familySlots;

    if (options.preserveObservation !== true) {`,
`    state.npcs = familyReconciled.npcs;
    state.socialGraph = familyReconciled.socialGraph;
    state.familySlots = familyReconciled.familySlots;

    // Passive birthday fill is metadata only. It applies after grounded reconciliation to
    // participating dossiers, and never manufactures ageChange or age-progression authority.
    const birthdayFillIds = new Set([...targetIds, ...returnedPatchSet]);
    if (options.birthdayFill && birthdayFillIds.size) {
        state.npcs = state.npcs.map(raw => birthdayFillIds.has(raw.id)
            ? normalizeNpc(applyBirthdayFill(raw, options.birthdayFill))
            : raw);
    }

    if (options.preserveObservation !== true) {`,
'passive birthday fill');

fs.writeFileSync(path, source);
console.log('Applied NPC State 0.4.3 birthday scanner canon semantics');
