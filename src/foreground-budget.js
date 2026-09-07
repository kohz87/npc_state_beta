import { NUMERIC_SETTINGS, normalizeNumericSetting } from './settings-contract.js';
export const FOREGROUND_MIN_BUDGET_TOKENS = NUMERIC_SETTINGS.injectBudgetTokens.min;
export const FOREGROUND_MAX_BUDGET_TOKENS = NUMERIC_SETTINGS.injectBudgetTokens.max;
export const FOREGROUND_DEFAULT_BUDGET_TOKENS = NUMERIC_SETTINGS.injectBudgetTokens.default;
export const FOREGROUND_TOKEN_ESTIMATE_METHOD = 'local conservative estimate (ASCII/3.5 + non-ASCII*1.1)';

export function estimateForegroundTokens(text) {
    let ascii = 0;
    let nonAscii = 0;
    for (const char of String(text ?? '')) {
        if (char.codePointAt(0) <= 0x7f) ascii += 1;
        else nonAscii += 1;
    }
    return Math.max(0, Math.ceil(ascii / 3.5 + nonAscii * 1.1));
}

export function normalizeForegroundBudgetTokens(value, fallback = FOREGROUND_DEFAULT_BUDGET_TOKENS) {
    return normalizeNumericSetting('injectBudgetTokens', value, fallback);
}
