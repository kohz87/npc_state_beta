// Shared numeric defaults, bounds, and UI attributes. No browser or schema dependencies.
export const NUMERIC_SETTINGS = Object.freeze(Object.fromEntries(Object.entries({
    scanDepth: { default: 8, min: 2, max: 30 },
    scannerResponseTokens: { default: 7000, min: 512, max: 15000, positive: true },
    injectDepth: { default: 1, min: 0, max: 20 },
    injectLimit: { default: 6, min: 1, max: 20 },
    injectBudgetTokens: { default: 1800, min: 256, max: 8000, positive: true },
    birthdayRandomDaysPerMonth: { default: 30, min: 1, max: 999 },
    staleArchiveAfter: { default: 30, min: 1, max: 9999 },
    staleDeleteAfter: { default: 50, min: 2, max: 10000 },
    relationshipHistoryLimit: { default: 8, min: 1, max: 24 },
}).map(([key, value]) => [key, Object.freeze(value)])));

export function normalizeNumericSetting(key, value, fallback = NUMERIC_SETTINGS[key]?.default) {
    const rule = NUMERIC_SETTINGS[key];
    if (!rule) throw new Error(`Unknown numeric setting: ${key}`);
    const parsed = value === '' || value == null ? NaN : Number(value);
    const safe = Number.isFinite(parsed) && (!rule.positive || parsed > 0) ? parsed : fallback;
    return Math.max(rule.min, Math.min(rule.max, Math.round(Number.isFinite(safe) ? safe : rule.default)));
}

export function numericSettingAttributes(key) {
    const { min, max } = NUMERIC_SETTINGS[key];
    return `min="${min}" max="${max}" step="1"`;
}
