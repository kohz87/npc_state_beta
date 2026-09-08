import {
    FOREGROUND_DEFAULT_BUDGET_TOKENS,
    FOREGROUND_MAX_BUDGET_TOKENS,
    FOREGROUND_MIN_BUDGET_TOKENS,
    FOREGROUND_TOKEN_ESTIMATE_METHOD,
    estimateForegroundTokens,
    normalizeForegroundBudgetTokens,
} from './foreground-budget.js';
import { FOREGROUND_CONTRACT_VERSION, foregroundContract } from './foreground-contract.js';
import {
    compactForegroundNpc,
    foregroundNpcCandidates,
    foregroundStateRevisionSignature,
    hashForegroundText,
    qualitativeRelationshipLens,
    runtimeNpcSalience,
    selectForegroundNpcs,
} from './foreground-context.js';
import { NPC_STATE_VERSION, normalizeDossierLimits } from './schema.js';

export {
    FOREGROUND_CONTRACT_VERSION,
    FOREGROUND_DEFAULT_BUDGET_TOKENS,
    FOREGROUND_MAX_BUDGET_TOKENS,
    FOREGROUND_MIN_BUDGET_TOKENS,
    FOREGROUND_TOKEN_ESTIMATE_METHOD,
    estimateForegroundTokens,
    normalizeForegroundBudgetTokens,
    qualitativeRelationshipLens,
    runtimeNpcSalience,
    selectForegroundNpcs,
};

const CACHE_LIMIT = 12;
const FOREGROUND_CONTEXT_PREFIX = 'SAVED NPC CONTINUITY (selected and compacted):\n';
const promptCache = new Map();
let lastForegroundDiagnostics = null;

function nowMs() {
    return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function buildSignature(state, settings) {
    return [
        foregroundStateRevisionSignature(state),
        settings.enabled !== false ? 1 : 0,
        settings.inject !== false ? 1 : 0,
        Number(settings.injectLimit) || 0,
        Number(settings.injectBudgetTokens) || 0,
        hashForegroundText(settings.foregroundCurrentUserText),
        JSON.stringify(normalizeDossierLimits(settings.dossierLimits)),
    ].join('~');
}

function cacheGet(signature) {
    const hit = promptCache.get(signature);
    if (!hit) return null;
    promptCache.delete(signature);
    promptCache.set(signature, hit);
    return hit;
}

function cacheSet(signature, value) {
    promptCache.set(signature, value);
    while (promptCache.size > CACHE_LIMIT) promptCache.delete(promptCache.keys().next().value);
}

function diagnosticSkeleton(settings, extra = {}) {
    const configuredBudget = Math.round(Number(settings.injectBudgetTokens) || FOREGROUND_DEFAULT_BUDGET_TOKENS);
    const effectiveBudget = normalizeForegroundBudgetTokens(configuredBudget);
    return {
        releaseVersion: NPC_STATE_VERSION,
        contractVersion: FOREGROUND_CONTRACT_VERSION,
        configuredBudgetTokens: configuredBudget,
        effectiveBudgetTokens: effectiveBudget,
        minimumBudgetTokens: FOREGROUND_MIN_BUDGET_TOKENS,
        budgetRaisedToMinimum: effectiveBudget !== configuredBudget,
        tokenCountKind: 'estimated',
        tokenEstimateMethod: FOREGROUND_TOKEN_ESTIMATE_METHOD,
        instructionChars: 0,
        dynamicContextChars: 0,
        totalChars: 0,
        instructionTokenEstimate: 0,
        dynamicTokenEstimate: 0,
        totalTokenEstimate: 0,
        dynamicBudgetTokenEstimate: 0,
        injectionLimit: Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6))),
        eligibleNpcCount: 0,
        selectedNpcCount: 0,
        selectedNpcIds: [],
        droppedForBudgetNpcIds: [],
        constructionMs: 0,
        cacheHit: false,
        mode: 'continuity-only',
        ...extra,
    };
}

export function buildForegroundInjection(state = {}, settings = {}) {
    const started = nowMs();
    const continuity = settings.inject !== false;
    const baseDiagnostics = diagnosticSkeleton(settings, { continuity });

    if (state?.branchSafety?.status && state.branchSafety.status !== 'safe') {
        return { prompt: '', diagnostics: { ...baseDiagnostics, disabledReason: 'branch-unsafe', constructionMs: nowMs() - started } };
    }
    if (settings.enabled === false || !continuity) {
        const reason = settings.enabled === false ? 'extension-disabled' : 'continuity-disabled';
        return { prompt: '', diagnostics: { ...baseDiagnostics, disabledReason: reason, constructionMs: nowMs() - started } };
    }

    const signature = buildSignature(state, settings);
    const cached = cacheGet(signature);
    if (cached) return { prompt: cached.prompt, diagnostics: { ...structuredClone(cached.diagnostics), cacheHit: true, constructionMs: nowMs() - started } };

    const instructionText = foregroundContract();
    const instructionTokenEstimate = estimateForegroundTokens(instructionText);
    const actualBudgetTokens = baseDiagnostics.effectiveBudgetTokens;
    const dynamicBudgetTokens = Math.max(0, actualBudgetTokens - instructionTokenEstimate);
    const available = foregroundNpcCandidates(state, settings);
    const eligible = available.slice(0, baseDiagnostics.injectionLimit);
    const selected = [];
    const dropped = [];
    let dynamic = { dossiers: [] };
    let dynamicText = JSON.stringify(dynamic);

    // Preserve strict priority. Start with the smallest continuity projection and only
    // enrich selected dossiers after membership is fixed.
    for (let i = 0; i < eligible.length; i += 1) {
        const npc = eligible[i];
        const compacted = compactForegroundNpc(npc, 4, settings.dossierLimits);
        const next = { dossiers: [...dynamic.dossiers, compacted] };
        const nextText = JSON.stringify(next);
        const estimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${nextText}`);
        if (estimate > actualBudgetTokens) {
            dropped.push(...eligible.slice(i).map(row => row.id));
            break;
        }
        dynamic = next;
        dynamicText = nextText;
        selected.push(npc.id);
    }

    for (const level of [3, 2, 1, 0]) {
        for (let i = 0; i < selected.length; i += 1) {
            const npc = eligible[i];
            if (!npc || npc.id !== selected[i]) continue;
            const dossiers = [...dynamic.dossiers];
            dossiers[i] = compactForegroundNpc(npc, level, settings.dossierLimits);
            const next = { dossiers };
            const nextText = JSON.stringify(next);
            const estimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${nextText}`);
            if (estimate > actualBudgetTokens) continue;
            dynamic = next;
            dynamicText = nextText;
        }
    }

    const prompt = `${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${dynamicText}`;
    const finalTokenEstimate = estimateForegroundTokens(prompt);
    const diagnostics = {
        ...baseDiagnostics,
        dynamicBudgetTokenEstimate: dynamicBudgetTokens,
        instructionChars: instructionText.length,
        dynamicContextChars: prompt.length - instructionText.length,
        totalChars: prompt.length,
        instructionTokenEstimate,
        dynamicTokenEstimate: Math.max(0, finalTokenEstimate - instructionTokenEstimate),
        totalTokenEstimate: finalTokenEstimate,
        eligibleNpcCount: available.length,
        selectedNpcCount: selected.length,
        selectedNpcIds: selected,
        droppedForBudgetNpcIds: dropped,
        constructionMs: nowMs() - started,
        cacheHit: false,
    };
    cacheSet(signature, { prompt, diagnostics: structuredClone(diagnostics) });
    return { prompt, diagnostics };
}

export function buildInjection(state = {}, settings = {}) {
    const built = buildForegroundInjection(state, settings);
    lastForegroundDiagnostics = built.diagnostics ? structuredClone(built.diagnostics) : null;
    return built.prompt;
}

export function injectionDiagnostics(state = {}, settings = {}) {
    return buildForegroundInjection(state, settings).diagnostics;
}

export function foregroundDiagnosticsSnapshot() {
    return lastForegroundDiagnostics ? structuredClone(lastForegroundDiagnostics) : null;
}
