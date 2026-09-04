import { normalizeActualAge, normalizeApparentAge, normalizeAppearanceForms, normalizeName } from './schema.js';
import { appearanceScalarIsLegacyBase } from './appearance.js';

export const AGE_PROGRESSION_MODE = 'age_progression';
const BEHAVIORS = new Set(['ordinary', 'accelerated', 'long_lived', 'ageless', 'unknown']);

function ageYears(value) {
    const age = normalizeActualAge(value);
    const number = Number(age.match(/\d{1,4}/)?.[0]);
    if (!age || !Number.isFinite(number)) return null;
    if (/\bdays?\b/i.test(age)) return number / 365;
    if (/\bweeks?\b/i.test(age)) return number / 52;
    if (/\bmonths?\b/i.test(age)) return number / 12;
    return number;
}

function apparentNumber(value) {
    const age = normalizeApparentAge(value);
    const number = Number(age.match(/\d{1,4}/)?.[0]);
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
const STRUCTURE = [['horn',/\bhorns?\b/],['wing',/\bwings?\b/],['tail',/\btails?\b/],['scar',/\bscars?\b/],['tattoo',/\btattoos?\b/],['marking',/\bmarkings?\b/],['rune',/\brunes?\b/],['prosthetic',/\bprosthetics?\b/],['claw',/\bclaws?\b/],['fang',/\bfangs?\b/],['fin',/\bfins?\b/],['ear',/\bears?\b/]];
const MAGIC = ['luminous','glowing','spectral','ethereal','crystalline'];
const MUTABLE = new Set(['small','little','child','childlike','young','younger','youthful','older','mature','maturing','matured','tall','taller','short','shorter','height','build','slight','slender','stocky','face','facial','cheek','cheeks','round','rounded','proportion','proportions','wrinkle','wrinkles']);
const COMMON = new Set(['the','a','an','and','or','with','has','have','having','is','are','was','were','her','his','their','its','body','form','appearance','ordinary','base','slightly','more','less']);
const MINOR_SEXUAL = /\b(?:breasts?|bust|cleavage|voluptuous|curvy|sexy|sensual|seductive|wide hips?|rounded thighs?)\b/i;

function keyText(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 5000);
}
function signature(value) {
    const text = keyText(value);
    const tokens = text.split(/\s+/).filter(Boolean);
    const colors = new Map();
    for (let i = 0; i < tokens.length; i += 1) {
        const target = TARGETS.get(tokens[i]);
        if (!target) continue;
        const found = [];
        // Support both adjective-before-noun (silver hair) and predicate/after-noun
        // wording (hair is silver) so short canonical descriptions cannot bypass color
        // preservation merely by changing grammar.
        for (let j = Math.max(0, i - 2); j <= Math.min(tokens.length - 1, i + 2); j += 1) {
            if (j !== i && COLORS.has(tokens[j])) found.push(tokens[j]);
        }
        if (found.length) colors.set(target, [...new Set(found)].sort().join('+'));
    }
    const structure = new Set(STRUCTURE.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    const magic = new Set(MAGIC.filter(marker => new RegExp('\\b' + marker + '\\b', 'i').test(text)));
    const core = new Set(tokens.filter(token => token.length >= 3 && !COMMON.has(token) && !MUTABLE.has(token)));
    const structuralDescriptors = new Map();
    const sizeWords = new Set(['small','smaller','large','larger','long','longer','short','shorter','tiny','huge','broad','broader','narrow','narrower']);
    const connectorWords = new Set(['at','on','in','of','with','and','or','the','a','an']);
    for (const [name, pattern] of STRUCTURE) {
        if (!pattern.test(text)) continue;
        const positions = [];
        for (let i = 0; i < tokens.length; i += 1) {
            const singular = tokens[i].replace(/s$/, '');
            if (singular === name || (name === 'prosthetic' && tokens[i].startsWith('prosthetic'))) positions.push(i);
        }
        const descriptors = new Set();
        for (const index of positions) {
            for (let j = Math.max(0, index - 2); j <= Math.min(tokens.length - 1, index + 3); j += 1) {
                if (j === index) continue;
                const token = tokens[j];
                if (token.length < 3 || connectorWords.has(token) || sizeWords.has(token) || COLORS.has(token) || TARGETS.has(token)) continue;
                descriptors.add(token);
            }
        }
        if (descriptors.size) structuralDescriptors.set(name, descriptors);
    }
    return { text, colors, structure, magic, core, structuralDescriptors };
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
    // Preserve stable local descriptors around structural canon. Size words may evolve
    // with biological maturation, but pointed->rounded ears, slender->thick horns, or a
    // scar moving to a different location are not authorized by age progression alone.
    for (const name of current.structure) {
        const before = current.structuralDescriptors.get(name) || new Set();
        const after = proposed.structuralDescriptors.get(name) || new Set();
        if (!before.size) continue;
        let overlap = 0;
        for (const token of before) if (after.has(token)) overlap += 1;
        if (!overlap || overlap / before.size < 0.5) return false;
    }
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
