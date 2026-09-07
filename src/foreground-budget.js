export const FOREGROUND_MIN_BUDGET_TOKENS = 1600;
export const FOREGROUND_MAX_BUDGET_TOKENS = 8000;
export const FOREGROUND_DEFAULT_BUDGET_TOKENS = 1800;
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
    const parsed = Math.round(Number(value));
    const safe = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    return Math.max(FOREGROUND_MIN_BUDGET_TOKENS, Math.min(FOREGROUND_MAX_BUDGET_TOKENS, safe));
}
