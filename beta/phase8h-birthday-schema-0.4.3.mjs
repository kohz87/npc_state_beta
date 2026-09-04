import fs from 'node:fs';

const path = 'v03/schema.js';
let source = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8H schema marker: ' + label);
    source = source.replace(from, to);
}

rep(
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

rep(
`    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'appearance', 'appearanceForms',`,
`    'name', 'aliases', 'role', 'species', 'age', 'apparentAge', 'birthday', 'appearance', 'appearanceForms',`,
'stable profile birthday');

rep(
`        age: normalizeActualAge(input.age),
        apparentAge: normalizeApparentAge(input.apparentAge),
        appearance: text(input.appearance, 1800),`,
`        age: normalizeActualAge(input.age),
        apparentAge: normalizeApparentAge(input.apparentAge),
        birthday: normalizeBirthday(input.birthday),
        birthdayProvenance: normalizeBirthdayProvenance(input.birthdayProvenance, input.birthday),
        appearance: text(input.appearance, 1800),`,
'normalize npc birthday');

fs.writeFileSync(path, source);
console.log('Applied NPC State 0.4.3 birthday schema and fill helpers');
