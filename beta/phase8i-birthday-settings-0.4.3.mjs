import fs from 'node:fs';

const path = 'v03/index.js';
let source = fs.readFileSync(path, 'utf8');
function rep(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase 8I settings marker: ' + label);
    source = source.replace(from, to);
}
rep(
`import { DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';`,
`import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS, NPC_STATE_VERSION, normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode } from './schema.js';`,
'schema imports');
rep(
`    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    staleManagementEnabled: true,`,
`    newNpcHistoryEnrichment: true,
    newNpcAdmissionMode: 'balanced',
    birthdayFillMode: 'off',
    birthdayRandomCalendar: DEFAULT_BIRTHDAY_RANDOM_CALENDAR,
    birthdayRandomDaysPerMonth: 30,
    staleManagementEnabled: true,`,
'defaults');
rep(
`    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.injectDepth =`,
`    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);
    settings.birthdayRandomCalendar = String(settings.birthdayRandomCalendar ?? DEFAULT_BIRTHDAY_RANDOM_CALENDAR).slice(0, 6000);
    settings.birthdayRandomDaysPerMonth = Math.max(1, Math.min(999, Math.round(Number(settings.birthdayRandomDaysPerMonth) || 30)));
    settings.injectDepth =`,
'normalization');
fs.writeFileSync(path, source);
console.log('Added NPC State 0.4.3 birthday fill settings');
