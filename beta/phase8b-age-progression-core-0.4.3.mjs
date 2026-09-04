import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8B marker: ' + label);
    return source.replace(from, to);
}

write('v03/age-progression.js', `import { normalizeActualAge, normalizeApparentAge, normalizeAppearanceForms, normalizeName } from './schema.js';
import { appearanceScalarIsLegacyBase } from './appearance.js';

export const AGE_PROGRESSION_MODE = 'age_progression';
const BEHAVIORS = new Set(['ordinary', 'accelerated', 'long_lived', 'ageless', 'unknown']);

function ageYears(value) {
    const age = normalizeActualAge(value);
    const number = Number(age.match(/\\d{1,4}/)?.[0]);
    if (!age || !Number.isFinite(number)) return null;
    if (/\\bdays?\\b/i.test(age)) return number / 365;
    if (/\\bweeks?\\b/i.test(age)) return number / 52;
    if (/\\bmonths?\\b/i.test(age)) return number / 12;
    return number;
}

function apparentNumber(value) {
    const age = normalizeApparentAge(value);
    const number = Number(age.match(/\\d{1,4}/)?.[0]);
    return Number.isFinite(number) ? number : null;
}

function threshold(behavior, visualAge) {
    if (behavior === 'accelerated') return 7 / 365;
    if (behavior === 'ordinary') return Number.isFinite(visualAge) && visualAge < 18 ? 0.75 : (Number.isFinite(visualAge) && visualAge < 40 ? 3 : 5);
    if (behavior === 'long_lived') return Number.isFinite(visualAge) && visualAge < 18 ? 5 : 10;
    return Number.POSITIVE_INFINITY;
}

export function progressionEvidence(patch = {}) {
    return String(patch?.ageProgression?.evidence || patch?.ageChange?.evidence || '').trim().slice(0, 700);
}

export function authorizeAgeProgression(npc = {}, patch = {}, changedAge = '', { evidenceGrounded = false } = {}) {
    const base = { allowed: false, behavior: 'unknown', intervalYears: 0, affectedForms: new Set(), affectsShared: false, visualAge: apparentNumber(npc?.apparentAge) };
    if (!changedAge) return base;
    const kind = String(patch?.ageChange?.kind || '').trim().toLocaleLowerCase();
    if (!['birthday', 'elapsed'].includes(kind)) return base;
    const raw = patch?.ageProgression;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.meaningful !== true || !evidenceGrounded) return base;
    const behavior = BEHAVIORS.has(String(raw.maturation || '').trim().toLocaleLowerCase()) ? String(raw.maturation).trim().toLocaleLowerCase() : 'unknown';
    if (behavior === 'unknown' || behavior === 'ageless') return { ...base, behavior };
    if (!String(raw.basis || '').trim()) return base;
    const before = ageYears(npc?.age);
    const after = ageYears(changedAge);
    if (!Number.isFinite(before) || !Number.isFinite(after) || after <= before) return base;
    const intervalYears = after - before;
    const visualAge = apparentNumber(npc?.apparentAge) ?? before;
    if (intervalYears + 1e-9 < threshold(behavior, visualAge)) return { ...base, behavior, intervalYears, visualAge };
    return {
        allowed: true,
        behavior,
        intervalYears,
        visualAge,
        affectsShared: raw.affectsShared === true,
        affectedForms: new Set((Array.isArray(raw.affectedForms) ? raw.affectedForms : []).map(normalizeName).filter(Boolean)),
    };
}

export function apparentAgeProgressionAllowed(npc = {}, proposedValue = '', progression = {}) {
    const proposed = apparentNumber(proposedValue);
    if (!progression?.allowed || !Number.isFinite(proposed)) return false;
    const current = apparentNumber(npc?.apparentAge);
    if (!Number.isFinite(current)) return true;
    if (proposed < current) return false;
    const interval = Math.max(0, Number(progression.intervalYears) || 0);
    const max = progression.behavior === 'accelerated' ? Math.max(2, interval * 24)
        : (progression.behavior === 'long_lived' ? Math.max(1, interval / 5) : Math.max(1, interval * 1.5));
    return proposed - current <= max + 1e-9;
}

const COLORS = new Set(['black','white','gray','grey','brown','blond','blonde','auburn','red','blue','green','amber','hazel','violet','purple','silver','gold','golden','azure','teal','cyan','pink','orange','crimson','scarlet','indigo']);
const TARGETS = new Map([['hair','hair'],['haired','hair'],['eye','eyes'],['eyes','eyes'],['eyed','eyes'],['iris','eyes'],['irises','eyes'],['skin','skin'],['fur','fur'],['scale','scales'],['scales','scales'],['feather','feathers'],['feathers','feathers'],['plumage','feathers']]);
const STRUCTURE = [['horn',/\\bhorns?\\b/],['wing',/\\bwings?\\b/],['tail',/\\btails?\\b/],['scar',/\\bscars?\\b/],['tattoo',/\\btattoos?\\b/],['marking',/\\bmarkings?\\b/],['rune',/\\brunes?\\b/],['prosthetic',/\\bprosthetics?\\b/],['claw',/\\bclaws?\\b/],['fang',/\\bfangs?\\b/],['fin',/\\bfins?\\b/],['ear',/\\bears?\\b/]];
const MAGIC = ['luminous','glowing','spectral','ethereal','crystalline'];
const MUTABLE = new Set(['small','little','child','childlike','young','younger','youthful','older','mature','maturing','matured','tall','taller','short','shorter','height','build','slight','slender','stocky','face','facial','cheek','cheeks','round','rounded','proportion','proportions','wrinkle','wrinkles']);
const COMMON = new Set(['the','a','an','and','or','with','has','have','having','is','are','was','were','her','his','their','its','body','form','appearance','ordinary','base','slightly','more','less']);
const MINOR_SEXUAL = /\\b(?:breasts?|bust|cleavage|voluptuous|curvy|sexy|sensual|seductive|wide hips?|rounded thighs?)\\b/i;

function keyText(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim().slice(0, 5000);
}
function signature(value) {
    const text = keyText(value);
    const tokens = text.split(/\\s+/).filter(Boolean);
    const colors = new Map();
    for (let i = 0; i < tokens.length; i += 1) {
        const target = TARGETS.get(tokens[i]);
        if (!target) continue;
        const found = [];
        for (let j = Math.max(0, i - 2); j < i; j += 1) if (COLORS.has(tokens[j])) found.push(tokens[j]);
        if (found.length) colors.set(target, [...new Set(found)].sort().join('+'));
    }
    const structure = new Set(STRUCTURE.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    const magic = new Set(MAGIC.filter(marker => new RegExp('\\\\b' + marker + '\\\\b', 'i').test(text)));
    const core = new Set(tokens.filter(token => token.length >= 3 && !COMMON.has(token) && !MUTABLE.has(token)));
    return { text, colors, structure, magic, core };
}
function sameSet(a, b) {
    if (a.size !== b.size) return false;
    for (const value of a) if (!b.has(value)) return false;
    return true;
}

export function ageProgressionAppearanceSafe(currentValue, proposedValue, npc = {}, patch = {}) {
    const current = signature(currentValue);
    const proposed = signature(proposedValue);
    if (!proposed.text || proposed.text === current.text) return false;
    if (!current.text) return true;
    for (const target of new Set([...current.colors.keys(), ...proposed.colors.keys()])) {
        if ((current.colors.get(target) || '') !== (proposed.colors.get(target) || '')) return false;
    }
    if (!sameSet(current.structure, proposed.structure) || !sameSet(current.magic, proposed.magic)) return false;
    const visualAge = apparentNumber(patch?.apparentAge) ?? apparentNumber(npc?.apparentAge) ?? ageYears(patch?.ageChange?.age) ?? ageYears(npc?.age);
    if (Number.isFinite(visualAge) && visualAge < 18 && MINOR_SEXUAL.test(String(proposedValue || ''))) return false;
    if (current.core.size >= 5) {
        let shared = 0;
        for (const token of current.core) if (proposed.core.has(token)) shared += 1;
        if (shared < 2 || shared / current.core.size < 0.30) return false;
    }
    return true;
}

export function sharedAgeProgressionAllowed(npc = {}, proposedValue = '', patch = {}, progression = {}) {
    if (!progression?.allowed) return false;
    if (appearanceScalarIsLegacyBase(npc)) return false;
    const hasForms = normalizeAppearanceForms(npc?.appearanceForms).length > 0;
    if (hasForms && progression.affectsShared !== true) return false;
    return ageProgressionAppearanceSafe(npc?.appearance, proposedValue, npc, patch);
}
`);

let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`import { appearanceFormDescription, appearanceScalarIsLegacyBase } from './appearance.js';`,
`import { appearanceFormDescription, appearanceScalarIsLegacyBase } from './appearance.js';
import { AGE_PROGRESSION_MODE, ageProgressionAppearanceSafe, apparentAgeProgressionAllowed, authorizeAgeProgression, progressionEvidence, sharedAgeProgressionAllowed } from './age-progression.js';`,
'age progression import');

scanner = rep(scanner,
`function mergeAppearanceFormPatch(existingValue, newValue, revisionValue, evidenceContext = '') {`,
`function mergeAppearanceFormPatch(existingValue, newValue, revisionValue, evidenceContext = '', ageProgression = null, npc = null, patch = null) {`,
'form merge signature');
scanner = rep(scanner,
`        const key = normalizeName(revised.name);
        indices = indexByName();
        const index = indices.get(key);
        if (Number.isInteger(index)) out[index] = revised;
        else if (out.length < 12) out.push(revised);`,
`        const key = normalizeName(revised.name);
        indices = indexByName();
        const index = indices.get(key);
        const mode = String(raw.mode || '').trim().toLocaleLowerCase();
        if (mode === AGE_PROGRESSION_MODE) {
            if (!ageProgression?.allowed || !Number.isInteger(index) || !ageProgression.affectedForms?.has(key)) continue;
            if (!ageProgressionAppearanceSafe(out[index]?.appearance, revised.appearance, npc || {}, patch || {})) continue;
        }
        if (Number.isInteger(index)) out[index] = revised;
        else if (mode !== AGE_PROGRESSION_MODE && out.length < 12) out.push(revised);`,
'form age progression gate');

scanner = rep(scanner,
`    if (field === 'appearance') {
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        if (mode === 'change') return CANON_APPEARANCE_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }`,
`    if (field === 'appearance') {
        if (mode === AGE_PROGRESSION_MODE) return sharedAgeProgressionAllowed(npc, incoming, patch, options.ageProgression);
        if (mode === 'correction') return CANON_CORRECTION_CUES.test(evidence + ' ' + context);
        if (mode === 'refine') return true;
        if (mode === 'change') return CANON_APPEARANCE_CHANGE_CUES.test(evidence + ' ' + context);
        return false;
    }`,
'shared age progression canon gate');

scanner = rep(scanner,
`    const stringFields = ['name', 'age', 'apparentAge'];`,
`    const stringFields = ['name', 'age'];`,
'apparent age dedicated path');
scanner = rep(scanner,
`    if (!locked.has('age')) {
        const changedAge = explicitAgeChange(npc, patch, options);
        if (changedAge) next.age = changedAge;
    }
    for (const field of ['role', 'species', 'background']) {`,
`    let changedAge = '';
    if (!locked.has('age')) {
        changedAge = explicitAgeChange(npc, patch, options);
        if (changedAge) next.age = changedAge;
    }
    const progressionProof = progressionEvidence(patch);
    const ageProgression = authorizeAgeProgression(npc, patch, changedAge, {
        evidenceGrounded: Boolean(progressionProof && profileEvidenceGrounded(progressionProof, String(options.profileContext || ''))),
    });
    if (!locked.has('apparentAge')) {
        const apparent = normalizeApparentAge(patch?.apparentAge);
        const currentApparent = normalizeApparentAge(next.apparentAge);
        if (apparent && !currentApparent) next.apparentAge = apparent;
        else if (apparent && apparent === currentApparent) next.apparentAge = apparent;
        else if (apparent && apparentAgeProgressionAllowed(npc, apparent, ageProgression)) next.apparentAge = apparent;
    }
    for (const field of ['role', 'species', 'background']) {`,
'age progression application');
scanner = rep(scanner,
`        else if (appearance && durableCanonDecision(npc, patch, 'appearance', appearance, options)) next.appearance = appearance;`,
`        else if (appearance && durableCanonDecision(npc, patch, 'appearance', appearance, { ...options, ageProgression })) next.appearance = appearance;`,
'shared age progression wiring');
scanner = rep(scanner,
`        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''));`,
`        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''), ageProgression, npc, patch);`,
'form age progression wiring');
scanner = rep(scanner,
`        'aliases', 'role', 'species', 'age', 'ageChange', 'apparentAge', 'appearance', 'appearanceForms', 'appearanceFormChanges',`,
`        'aliases', 'role', 'species', 'age', 'ageChange', 'ageProgression', 'apparentAge', 'appearance', 'appearanceForms', 'appearanceFormChanges',`,
'structured import sanitizer');
write('v03/scanner.js', scanner);

console.log('Applied NPC State 0.4.3 phase 8B age-progression backend authorization');
