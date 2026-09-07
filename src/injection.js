import {
    FOREGROUND_DEFAULT_BUDGET_TOKENS,
    FOREGROUND_MAX_BUDGET_TOKENS,
    FOREGROUND_MIN_BUDGET_TOKENS,
    FOREGROUND_TOKEN_ESTIMATE_METHOD,
    estimateForegroundTokens,
    normalizeForegroundBudgetTokens,
} from './foreground-budget.js';
import { FOREGROUND_CONTRACT_VERSION, foregroundContract, optionalForegroundRubrics } from './foreground-contract.js';
import {
    clipForegroundText,
    compactForegroundNpc,
    completeForegroundHistoryRows,
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
const FOREGROUND_CONTEXT_PREFIX = 'FOREGROUND CONTEXT (selected once; collection refs are edit targets):\n';
const promptCache = new Map();
let lastForegroundDiagnostics = null;

function nowMs() {
    return typeof globalThis.performance?.now === 'function' ? globalThis.performance.now() : Date.now();
}

function buildSignature(state, settings) {
    return [
        foregroundStateRevisionSignature(state),
        settings.enabled !== false ? 1 : 0,
        settings.autoScan !== false ? 1 : 0,
        settings.inject !== false ? 1 : 0,
        Number(settings.injectLimit) || 0,
        Number(settings.injectBudgetTokens) || 0,
        String(settings.newNpcAdmissionMode || 'balanced'),
        String(settings.scanConnectionProfileId || ''),
        settings.scanAfterEachResponse === true ? 1 : 0,
        settings.newNpcHistoryEnrichment !== false ? 1 : 0,
        settings.structuredEvidenceDetected === true ? 1 : 0,
        hashForegroundText(settings.foregroundCurrentUserText),
        hashForegroundText(settings.foregroundNewNpcHistory),
        hashForegroundText(settings.relationshipCriteria),
        hashForegroundText(settings.memoryCriteria),
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
    const profileId = String(settings.scanConnectionProfileId || '').trim();
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
        historyRowsIncluded: 0,
        constructionMs: 0,
        cacheHit: false,
        backgroundRoute: profileId ? { kind: 'profile', profileId } : { kind: 'current' },
        backgroundCompletenessEnabled: settings.scanAfterEachResponse === true,
        requestDispatch: 'unavailable: NPC State does not hook browser request dispatch',
        firstResponseData: 'unavailable: no provider-stream lifecycle hook is owned by NPC State',
        firstVisibleOutput: 'unavailable: no reliable cross-provider first-paint hook is owned by NPC State',
        ...extra,
    };
}

export function buildForegroundInjection(state = {}, settings = {}) {
    const started = nowMs();
    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    const baseDiagnostics = diagnosticSkeleton(settings, { capture, continuity });

    if (state?.branchSafety?.status && state.branchSafety.status !== 'safe') {
        return { prompt: '', diagnostics: { ...baseDiagnostics, disabledReason: 'branch-unsafe', constructionMs: nowMs() - started } };
    }
    if (settings.enabled === false || (!capture && !continuity)) {
        const reason = settings.enabled === false ? 'extension-disabled' : 'capture-and-continuity-disabled';
        return { prompt: '', diagnostics: { ...baseDiagnostics, disabledReason: reason, constructionMs: nowMs() - started } };
    }

    const signature = buildSignature(state, settings);
    const cached = cacheGet(signature);
    if (cached) {
        return {
            prompt: cached.prompt,
            diagnostics: { ...structuredClone(cached.diagnostics), cacheHit: true, constructionMs: nowMs() - started },
        };
    }

    const mandatory = foregroundContract(settings, { capture, continuity });
    const mandatoryTokens = estimateForegroundTokens(mandatory);
    const contractFloor = mandatoryTokens + 48;
    const actualBudgetTokens = Math.max(baseDiagnostics.effectiveBudgetTokens, contractFloor);
    const optional = optionalForegroundRubrics(settings);
    let instructionText = mandatory;
    let instructionTokenEstimate = estimateForegroundTokens(instructionText);
    let dynamicBudgetTokens = Math.max(0, actualBudgetTokens - instructionTokenEstimate);
    const available = foregroundNpcCandidates(state, settings);
    const eligible = available.slice(0, baseDiagnostics.injectionLimit);
    const selected = [];
    const dropped = [];
    let dynamic = { dossiers: [], recentHistory: [] };
    let dynamicText = JSON.stringify(dynamic);
    let totalEstimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${dynamicText}`);

    // Reserve the smallest complete dossier in strict priority order first. Once a
    // higher-priority candidate cannot fit, lower-priority candidates cannot displace it.
    for (let i = 0; i < eligible.length; i += 1) {
        const npc = eligible[i];
        const compacted = compactForegroundNpc(npc, 4, settings.dossierLimits);
        const next = { ...dynamic, dossiers: [...dynamic.dossiers, compacted] };
        const nextText = JSON.stringify(next);
        const estimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${nextText}`);
        const nextDynamicEstimate = Math.max(0, estimate - instructionTokenEstimate);
        if (estimate > actualBudgetTokens || nextDynamicEstimate > dynamicBudgetTokens) {
            dropped.push(...eligible.slice(i).map(row => row.id));
            break;
        }
        dynamic = next;
        dynamicText = nextText;
        totalEstimate = estimate;
        selected.push(npc.id);
    }

    if (optional) {
        const candidate = `${instructionText}\n${optional}`;
        if (estimateForegroundTokens(`${candidate}\n${FOREGROUND_CONTEXT_PREFIX}${dynamicText}`) <= actualBudgetTokens) {
            instructionText = candidate;
            instructionTokenEstimate = estimateForegroundTokens(candidate);
            dynamicBudgetTokens = Math.max(0, actualBudgetTokens - instructionTokenEstimate);
        }
    }

    // Enrich only after priority reservations are secure. Upgrade in rounds so the
    // remaining space improves already-selected dossiers without changing membership.
    for (const level of [3, 2, 1, 0]) {
        for (let i = 0; i < selected.length; i += 1) {
            const npc = eligible[i];
            if (!npc || npc.id !== selected[i]) continue;
            const compacted = compactForegroundNpc(npc, level, settings.dossierLimits);
            const dossiers = [...dynamic.dossiers];
            dossiers[i] = compacted;
            const next = { ...dynamic, dossiers };
            const nextText = JSON.stringify(next);
            const estimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${nextText}`);
            const nextDynamicEstimate = Math.max(0, estimate - instructionTokenEstimate);
            if (estimate > actualBudgetTokens || nextDynamicEstimate > dynamicBudgetTokens) continue;
            dynamic = next;
            dynamicText = nextText;
            totalEstimate = estimate;
        }
    }

    if (capture && settings.newNpcHistoryEnrichment !== false) {
        for (const row of completeForegroundHistoryRows(settings.foregroundNewNpcHistory, 6)) {
            const clipped = clipForegroundText(row, 620);
            if (!clipped) continue;
            const next = { ...dynamic, recentHistory: [...dynamic.recentHistory, clipped] };
            const nextText = JSON.stringify(next);
            const estimate = estimateForegroundTokens(`${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${nextText}`);
            const dynamicEstimate = Math.max(0, estimate - instructionTokenEstimate);
            if (estimate > actualBudgetTokens || dynamicEstimate > dynamicBudgetTokens) break;
            dynamic = next;
            dynamicText = nextText;
            totalEstimate = estimate;
        }
    }

    const prompt = `${instructionText}\n${FOREGROUND_CONTEXT_PREFIX}${dynamicText}`;
    const finalTokenEstimate = estimateForegroundTokens(prompt);
    const diagnostics = {
        ...baseDiagnostics,
        effectiveBudgetTokens: actualBudgetTokens,
        budgetRaisedToMinimum: actualBudgetTokens !== baseDiagnostics.configuredBudgetTokens,
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
        historyRowsIncluded: dynamic.recentHistory.length,
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
