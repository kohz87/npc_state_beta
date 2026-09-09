import { NUMERIC_SETTINGS, normalizeFirstContactFollowUpMode, normalizeNumericSetting } from './settings-contract.js';
import { DEFAULT_BIRTHDAY_RANDOM_CALENDAR, DEFAULT_RELATIONSHIP_CAPS, DOSSIER_LIMIT_DEFAULTS,
    normalizeBirthdayFillMode, normalizeDossierLimits, normalizeNpcAdmissionMode, normalizeRelationshipCaps } from './schema.js';
import { DEFAULT_PORTRAIT_NEGATIVE_PROMPT, DEFAULT_PORTRAIT_POSITIVE_PROMPT, DEFAULT_PORTRAIT_PRESET,
    normalizePortraitPromptSettings } from './portrait-prompt.js';
import { migrateSettings } from './settings-migrations.js';

export const SETTINGS_SCHEMA = 1;
const DEFAULT_RELATIONSHIP_CRITERIA = `The shared relationship-judgment rubric is the default authority. Use this field only for optional campaign-specific calibration; custom criteria are additive and do not replace current-exchange evidence, per-axis meanings, or deterministic score mechanics.`;

const DEFAULT_MEMORY_CRITERIA = `Store only durable NPC memories that can matter in later scenes: consequential promises, betrayals, rescues, injuries, discoveries, relationship-defining exchanges, major gifts/debts, established secrets, completed registrations or credentials that establish lasting access, lasting changes of circumstance, and other facts the NPC would reasonably remember later. Do not store routine dialogue, transient mood, narration texture, or duplicate paraphrases of an existing memory.`;

const defaults = {
    enabled: true,
    autoScan: true,
    scanConnectionProfileId: '',
    inject: true,
    showDossierDiagnostics: false,
    branchRescan: true,
    newNpcAdmissionMode: 'balanced',
    firstContactFollowUpMode: 'off',
    birthdayFillMode: 'off',
    birthdayRandomCalendar: DEFAULT_BIRTHDAY_RANDOM_CALENDAR,
    staleManagementEnabled: true,
    portraitPromptMode: 'hybrid',
    portraitPreset: DEFAULT_PORTRAIT_PRESET,
    portraitPositivePrompt: DEFAULT_PORTRAIT_POSITIVE_PROMPT,
    portraitNegativePrompt: DEFAULT_PORTRAIT_NEGATIVE_PROMPT,
    dossierLimits: { ...DOSSIER_LIMIT_DEFAULTS },
    relationshipCaps: { ...DEFAULT_RELATIONSHIP_CAPS },
    relationshipCriteria: DEFAULT_RELATIONSHIP_CRITERIA,
    memoryCriteria: DEFAULT_MEMORY_CRITERIA,
    workflowMode: 'post-response-v1',
    dataFiles: {},
};

export const SETTINGS_DEFINITIONS = Object.freeze({
    ...Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, Object.freeze({ default: value })])),
    ...NUMERIC_SETTINGS,
});

// Normalize in place so callbacks, sidecar pointers, and extension-owned references stay valid.
export function normalizeSettings(settings = {}) {
    migrateSettings(settings, DEFAULT_RELATIONSHIP_CRITERIA);
    for (const [key, definition] of Object.entries(SETTINGS_DEFINITIONS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(definition.default);
    }
    settings.schemaVersion = SETTINGS_SCHEMA;
    for (const key of Object.keys(NUMERIC_SETTINGS)) settings[key] = normalizeNumericSetting(key, settings[key]);
    settings.scanConnectionProfileId = String(settings.scanConnectionProfileId || '').trim().slice(0, 240);
    settings.newNpcAdmissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    settings.firstContactFollowUpMode = normalizeFirstContactFollowUpMode(settings.firstContactFollowUpMode);
    settings.birthdayFillMode = normalizeBirthdayFillMode(settings.birthdayFillMode);
    settings.birthdayRandomCalendar = String(settings.birthdayRandomCalendar ?? DEFAULT_BIRTHDAY_RANDOM_CALENDAR).slice(0, 6000);
    settings.staleDeleteAfter = Math.max(settings.staleArchiveAfter + 1, settings.staleDeleteAfter);
    settings.dossierLimits = normalizeDossierLimits(settings.dossierLimits);
    const portrait = normalizePortraitPromptSettings(settings);
    for (const key of ['portraitPromptMode', 'portraitPreset', 'portraitPositivePrompt', 'portraitNegativePrompt']) settings[key] = portrait[key];
    delete settings.portraitGenerationPrompt;
    delete settings.portraitPositivePreset;
    delete settings.portraitNegativePreset;
    settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);
    settings.showDossierDiagnostics = settings.showDossierDiagnostics === true;
    if (!settings.dataFiles || typeof settings.dataFiles !== 'object' || Array.isArray(settings.dataFiles)) settings.dataFiles = {};
    return settings;
}

export function extensionSettings(extensionSettingsRoot) {
    let root = extensionSettingsRoot.npc_state_beta;
    if (!root || typeof root !== 'object' || Array.isArray(root)) root = extensionSettingsRoot.npc_state_beta = {};
    if (!root.v3 || typeof root.v3 !== 'object' || Array.isArray(root.v3)) root.v3 = {};
    return normalizeSettings(root.v3);
}
