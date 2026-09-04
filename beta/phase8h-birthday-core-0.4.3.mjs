import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8H marker: ' + label);
    return source.replace(from, to);
}
function repAll(source, from, to, expected, label) {
    const count = source.split(from).length - 1;
    if (count !== expected) throw new Error('Phase 8H marker count mismatch for ' + label + ': expected ' + expected + ', got ' + count);
    return source.split(from).join(to);
}

let schema = read('v03/schema.js');
schema = rep(schema,
`export function normalizeNpcAdmissionMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return NPC_ADMISSION_MODES.includes(mode) ? mode : 'balanced';
}
export const RELATIONSHIP_AXES`,
`export function normalizeNpcAdmissionMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return NPC_ADMISSION_MODES.includes(mode) ? mode : 'balanced';
}

export const BIRTHDAY_FILL_MODES = Object.freeze(['off', 'unknown', 'random']);
export const DEFAULT_BIRTHDAY_RANDOM_CALENDAR = Object.freeze([
    'January:31', 'February:28', 'March:31', 'April:30', 'May:31', 'June:30',
    'July:31', 'August:31', 'September:30', 'October:31', 'November:30', 'December:31',
].join('\\n'));
export function normalizeBirthdayFillMode(value) {
    const mode = String(value || '').trim().toLocaleLowerCase();
    return BIRTHDAY_FILL_MODES.includes(mode) ? mode : 'off';
}
export function normalizeBirthday(value) {
    return String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, 120);
}
export function normalizeBirthdayProvenance(value, birthday = '') {
    const source = String(value || '').trim().toLocaleLowerCase();
    if (['explicit', 'generated', 'manual'].includes(source)) return source;
    return normalizeBirthday(birthday) ? 'explicit' : '';
}
export function normalizeBirthdayCalendar(value, fallbackDays = 30) {
    const fallback = Math.max(1, Math.min(999, Math.round(Number(fallbackDays) || 30)));
    const out = [];
    const seen = new Set();
    for (const raw of String(value ?? '').split(/\\r?\\n|;/)) {
        const line = raw.trim();
        if (!line) continue;
        const match = line.match(/^(.*?)(?:\\s*:\\s*(\\d{1,3}))?$/);
        const name = normalizeBirthday(match?.[1] || '');
        const key = name.toLocaleLowerCase();
        if (!name || seen.has(key)) continue;
        seen.add(key);
        const days = Math.max(1, Math.min(999, Math.round(Number(match?.[2]) || fallback)));
        out.push({ name, days });
        if (out.length >= 48) break;
    }
    return out;
}
function birthdayHash(value) {
    const source = String(value || '');
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
        hash ^= source.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
export function generatedBirthdayForNpc(npc = {}, calendarValue = '', fallbackDays = 30) {
    const months = normalizeBirthdayCalendar(calendarValue, fallbackDays);
    if (!months.length) return '';
    const seed = String(npc?.id || npc?.name || 'npc');
    const month = months[birthdayHash(seed + '|birthday-month-v1') % months.length];
    const day = 1 + (birthdayHash(seed + '|birthday-day-v1') % month.days);
    return String(day) + ' ' + month.name;
}
export function applyBirthdayFill(npcInput = {}, options = {}) {
    const npc = structuredClone(npcInput || {});
    const current = normalizeBirthday(npc.birthday);
    const provenance = normalizeBirthdayProvenance(npc.birthdayProvenance, current);
    npc.birthday = current;
    npc.birthdayProvenance = provenance;
    if (current || (npc.manualProfileFields || []).includes('birthday') || provenance === 'manual') return npc;
    const mode = normalizeBirthdayFillMode(options.mode);
    if (mode === 'off') return npc;
    const value = mode === 'unknown'
        ? 'Unknown'
        : generatedBirthdayForNpc(npc, options.calendar, options.fallbackDays);
    if (!value) return npc;
    npc.birthday = value;
    npc.birthdayProvenance = 'generated';
    npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
    return npc;
}

export const RELATIONSHIP_AXES`,
'birthday helpers');

schema = rep(schema,
`    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'appearance', 'appearanceForms',`,
`    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'birthday', 'appearance', 'appearanceForms',`,
'stable profile birthday');

schema = rep(schema,
`        age: normalizeActualAge(input.age),
        apparentAge: normalizeApparentAge(input.apparentAge),
        appearance: text(input.appearance, 1800),`,
`        age: normalizeActualAge(input.age),
        apparentAge: normalizeApparentAge(input.apparentAge),
        birthday: normalizeBirthday(input.birthday),
        birthdayProvenance: normalizeBirthdayProvenance(input.birthdayProvenance, input.birthday),
        appearance: text(input.appearance, 1800),`,
'normalize npc birthday');
write('v03/schema.js', schema);

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`    STABLE_PROFILE_FIELDS,
    applyRelationshipMilestoneCrossings,`,
`    STABLE_PROFILE_FIELDS,
    applyBirthdayFill,
    applyRelationshipMilestoneCrossings,`,
'scanner birthday fill import');
scanner = rep(scanner,
`    normalizeApparentAge,
    normalizeCurrentStatus,`,
`    normalizeApparentAge,
    normalizeBirthday,
    normalizeBirthdayProvenance,
    normalizeCurrentStatus,`,
'scanner birthday normalizer imports');
scanner = rep(scanner,
`        age: npc.age,
        apparentAge: npc.apparentAge,
        appearance: npc.appearance,`,
`        age: npc.age,
        apparentAge: npc.apparentAge,
        birthday: npc.birthday,
        birthdayProvenance: npc.birthdayProvenance,
        appearance: npc.appearance,`,
'roster birthday context');
scanner = rep(scanner,
`const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role']);`,
`const DURABLE_CANON_FIELDS = new Set(['appearance', 'species', 'background', 'role', 'birthday']);
const BIRTHDAY_EVIDENCE_CUES = /\\b(?:birthday|birth date|date of birth|born(?:\\s+on)?|name day|nameday)\\b/i;
function birthdayEvidenceGrounded(value, context) {
    const birthday = normalizeBirthday(value);
    const source = String(context || '');
    return Boolean(birthday && source.trim() && BIRTHDAY_EVIDENCE_CUES.test(source) && profileEvidenceGrounded(birthday, source));
}`,
'birthday durable canon');
scanner = rep(scanner,
`    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);`,
`    if (field === 'birthday') {
        return mode === 'correction' && CANON_CORRECTION_CUES.test(evidence + ' ' + context);
    }
    if (field === 'species') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);`,
'birthday correction authority');
scanner = rep(scanner,
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
scanner = rep(scanner,
`    state.npcs = familyReconciled.npcs;
    state.socialGraph = familyReconciled.socialGraph;
    state.familySlots = familyReconciled.familySlots;

    if (options.preserveObservation !== true) {`,
`    state.npcs = familyReconciled.npcs;
    state.socialGraph = familyReconciled.socialGraph;
    state.familySlots = familyReconciled.familySlots;

    // Passive birthday fill is backend metadata only. It applies after grounded scanner
    // updates, only to dossiers actually participating in this reconciliation, and never
    // manufactures age changes or age-progression authority.
    const birthdayFillIds = new Set([...targetIds, ...returnedPatchSet]);
    if (options.birthdayFill && birthdayFillIds.size) {
        state.npcs = state.npcs.map(raw => birthdayFillIds.has(raw.id)
            ? normalizeNpc(applyBirthdayFill(raw, options.birthdayFill))
            : raw);
    }

    if (options.preserveObservation !== true) {`,
'passive birthday fill');
write('v03/scanner.js', scanner);

let engine = read('v03/engine.js');
engine = repAll(engine,
`                dossierLimits: settings.dossierLimits,
                applyReturnedNpcPatches: true,`,
`                dossierLimits: settings.dossierLimits,
                birthdayFill: {
                    mode: settings.birthdayFillMode,
                    calendar: settings.birthdayRandomCalendar,
                    fallbackDays: settings.birthdayRandomDaysPerMonth,
                },
                applyReturnedNpcPatches: true,`,
4,
'engine birthday fill options');
write('v03/engine.js', engine);

console.log('Applied NPC State 0.4.3 passive birthday canon and fill core');
