from pathlib import Path


def replace(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing patch anchor in {path}: {old[:100]!r}')
    p.write_text(text.replace(old, new, 1))

# 1. Scanner recursion guard: scope it to the scanner's own synchronous generateRaw invocation.
replace('src/index.js',
"let postResponseCoordinator = null;\nlet scannerGenerationDepth = 0;\n",
"let postResponseCoordinator = null;\nlet scannerGenerationInvocationDepth = 0;\n")
replace('src/index.js',
"function getSettings() {\n    return extensionSettings(extension_settings);\n}\n",
"function getSettings() {\n    return extensionSettings(extension_settings);\n}\n\nfunction invokeScannerGeneration(task) {\n    scannerGenerationInvocationDepth += 1;\n    try {\n        return task();\n    } finally {\n        scannerGenerationInvocationDepth = Math.max(0, scannerGenerationInvocationDepth - 1);\n    }\n}\n")
replace('src/index.js',
"async function generateJson({ systemPrompt, prompt, responseLength, route = null, signal = null }) {\n    const selectedRoute = route || resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);\n    scannerGenerationDepth += 1;\n    try {\n        return await runSharedQuietGeneration('npc-state-scan', () => generateWithScanRoute({\n            getContext, route: selectedRoute, systemPrompt, prompt, responseLength, signal,\n        }));\n    } finally {\n        scannerGenerationDepth = Math.max(0, scannerGenerationDepth - 1);\n    }\n}\n",
"async function generateJson({ systemPrompt, prompt, responseLength, route = null, signal = null }) {\n    const selectedRoute = route || resolveScanGenerationRoute(getContext, getSettings().scanConnectionProfileId);\n    return runSharedQuietGeneration('npc-state-scan', async () => {\n        // Only the scanner's own synchronous host generation invocation bypasses the\n        // awaited next-turn gate. Once the provider promise is pending, ordinary\n        // roleplay generation/response events must synchronize normally.\n        const request = invokeScannerGeneration(() => generateWithScanRoute({\n            getContext, route: selectedRoute, systemPrompt, prompt, responseLength, signal,\n        }));\n        return await request;\n    });\n}\n")
replace('src/index.js',
"    onStateChanged: () => {\n        updateInjection();\n",
"    onManualScanCommitted: (messageId, result) => postResponseCoordinator?.adoptSuccessfulResult(messageId, result),\n    onStateChanged: () => {\n        updateInjection();\n")
replace('src/index.js',
"    runScan: (messageId, { source, signal, onPhase } = {}) => engine.scan(messageId, { manual: false, force: false, expectedSource: source, signal, onPhase }),\n",
"    runScan: (messageId, { source, signal, onPhase, force = false } = {}) => engine.scan(messageId, { manual: false, force, expectedSource: source, signal, onPhase }),\n")
replace('src/index.js',
"export function processCompletedAssistantResponse(messageId) {\n    if (scannerGenerationDepth > 0) return Promise.resolve({ ok: false, skipped: true, reason: 'scanner-generation' });\n",
"export function processCompletedAssistantResponse(messageId) {\n    if (scannerGenerationInvocationDepth > 0) return Promise.resolve({ ok: false, skipped: true, reason: 'scanner-generation' });\n")
replace('src/index.js',
"export async function npcStateGenerationInterceptor(_chat, _contextSize, abort) {\n    if (scannerGenerationDepth > 0) return;\n",
"export async function npcStateGenerationInterceptor(_chat, _contextSize, abort) {\n    if (scannerGenerationInvocationDepth > 0) return;\n")

# 2. Coordinator retry and manual-repair adoption.
replace('src/post-response-coordinator.js',
"function resultStatus(result) {\n    if (result?.ok) {\n        if (result?.discarded) return 'blocked';\n        const partial = (result.coverageDiagnostics || []).some(row => row?.status === 'incomplete-evaluation')\n",
"function resultStatus(result) {\n    if (result?.ok) {\n        if (result?.discarded) return 'blocked';\n        const partial = result?.partial === true\n            || (result.coverageDiagnostics || []).some(row => row?.status === 'incomplete-evaluation')\n")
replace('src/post-response-coordinator.js',
"    function process(messageId) {\n",
"    function process(messageId, { force = false } = {}) {\n")
replace('src/post-response-coordinator.js',
"        const existing = jobs.get(source.identity);\n        if (existing) return existing.promise;\n",
"        const existing = jobs.get(source.identity);\n        if (existing && (!force || !existing.settled)) return existing.promise;\n        if (existing?.settled && force) {\n            existing.controller?.abort();\n            jobs.delete(source.identity);\n        }\n")
replace('src/post-response-coordinator.js',
"                const result = await runScan(source.messageId, {\n                    source,\n                    signal: job.controller.signal,\n",
"                const result = await runScan(source.messageId, {\n                    source,\n                    force,\n                    signal: job.controller.signal,\n")
replace('src/post-response-coordinator.js',
"                job.result = result;\n                const next = resultStatus(result);\n                if (!job.timedOut) setStatus(source, next, result?.reason || '');\n",
"                job.result = result;\n                let next = resultStatus(result);\n                const prior = statuses.get(source.chatKey);\n                if (result?.skipped && result?.reason === 'already-scanned' && prior?.identity === source.identity\n                    && ['partial', 'failed', 'blocked'].includes(prior.status)) next = prior.status;\n                if (!job.timedOut) setStatus(source, next, result?.reason || '');\n")
replace('src/post-response-coordinator.js',
"        jobs.delete(source.identity);\n        return process(source.messageId);\n    }\n\n    function clearChat(chatKey) {\n",
"        jobs.delete(source.identity);\n        return process(source.messageId, { force: true });\n    }\n\n    function adoptSuccessfulResult(messageId, result) {\n        if (!result?.ok || result?.discarded) return false;\n        const source = getSource(messageId);\n        const latest = getLatestSource();\n        if (!source?.valid || !latest?.valid || source.identity !== latest.identity) return false;\n        const previousIdentity = currentByChat.get(source.chatKey);\n        const previous = previousIdentity ? jobs.get(previousIdentity) : null;\n        if (previous && previousIdentity !== source.identity) previous.controller?.abort();\n        if (previousIdentity && previousIdentity !== source.identity) jobs.delete(previousIdentity);\n        const same = jobs.get(source.identity);\n        same?.controller?.abort();\n        const controller = new AbortController();\n        const adopted = { source, result, controller, timedOut: false, settled: true, promise: Promise.resolve(result) };\n        jobs.set(source.identity, adopted);\n        currentByChat.set(source.chatKey, source.identity);\n        latestMessageByChat.set(source.chatKey, source.messageId);\n        setStatus(source, resultStatus(result), result?.reason || 'manual-scan-repaired-source');\n        return true;\n    }\n\n    function clearChat(chatKey) {\n")
replace('src/post-response-coordinator.js',
"    return Object.freeze({ process, settleLatest, retryLatest, status, clearChat });\n",
"    return Object.freeze({ process, settleLatest, retryLatest, adoptSuccessfulResult, status, clearChat });\n")

# Engine reports successful manual repair back to the post-response coordinator.
replace('src/engine.js',
"    const onStateChanged = adapters.onStateChanged || (() => {});\n",
"    const onStateChanged = adapters.onStateChanged || (() => {});\n    const onManualScanCommitted = adapters.onManualScanCommitted || (() => {});\n")
old_return = """            return {\n                ok: true,\n                messageId,\n                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,\n                finalPresentNpcIds: applied.finalPresentNpcIds,\n                worldActiveNpcIds: applied.worldActiveNpcIds,\n                referencedNpcIds,\n                targetNpcIds: applied.targetNpcIds,\n                semanticDiagnostics: applied.semanticDiagnostics || [],\n                coverageDiagnostics: applied.coverageDiagnostics || [],\n                stale: {\n                    archivedIds: stale.archivedIds,\n                    restoredIds: stale.restoredIds,\n                    deletedIds: stale.deletedIds,\n                    currentTurn: stale.currentTurn,\n                },\n                state: structuredClone(persisted),\n            };\n"""
new_return = """            const scanResult = {\n                ok: true,\n                messageId,\n                exchangeActiveNpcIds: applied.exchangeActiveNpcIds,\n                finalPresentNpcIds: applied.finalPresentNpcIds,\n                worldActiveNpcIds: applied.worldActiveNpcIds,\n                referencedNpcIds,\n                targetNpcIds: applied.targetNpcIds,\n                semanticDiagnostics: applied.semanticDiagnostics || [],\n                coverageDiagnostics: applied.coverageDiagnostics || [],\n                stale: {\n                    archivedIds: stale.archivedIds,\n                    restoredIds: stale.restoredIds,\n                    deletedIds: stale.deletedIds,\n                    currentTurn: stale.currentTurn,\n                },\n                state: structuredClone(persisted),\n            };\n            if (manual) {\n                try { onManualScanCommitted(messageId, scanResult); } catch (error) {\n                    console.warn('[NPC State Beta] manual scan status reconciliation failed safely', error);\n                }\n            }\n            return scanResult;\n"""
replace('src/engine.js', old_return, new_return)

# 3. Ambiguity-safe short-name relevance, including explicitly mentioned archived/deceased dossiers.
replace('src/scan-prompts.js',
"import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, normalizeDossierLimits, normalizeNpcAdmissionMode, normalizeRelationship, normalizeRelationshipEvidenceHistory, normalizeRelationshipProgress, normalizeRelationshipSummary } from './schema.js';\nimport { compactForegroundNpc, foregroundNpcCandidates } from './foreground-context.js';\n",
"import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, normalizeDossierLimits, normalizeName, normalizeNpcAdmissionMode, normalizeRelationship, normalizeRelationshipEvidenceHistory, normalizeRelationshipProgress, normalizeRelationshipSummary } from './schema.js';\nimport { compactForegroundNpc, foregroundNpcCandidates, runtimeNpcSalience } from './foreground-context.js';\n")
old_relevant = """function relevantNpcsForExchange(state, exchange, limit = 12) {\n    const visible = [exchange?.user?.mes, exchange?.assistant?.mes].map(value => scannerEvidenceText(value || '')).filter(Boolean).join('\\n');\n    const active = new Set([\n        ...(state?.lastObservation?.exchangeActiveNpcIds || []),\n        ...(state?.lastObservation?.finalPresentNpcIds || []),\n        ...(state?.lastObservation?.worldActiveNpcIds || []),\n    ]);\n    const mentioned = new Set();\n    for (const npc of state?.npcs || []) {\n        const labels = [npc?.name, ...(npc?.aliases || [])].filter(Boolean);\n        if (labels.some(label => containsNormalizedPhrase(visible, label))) mentioned.add(npc.id);\n        if (npc?.present || npc?.worldActive) active.add(npc.id);\n    }\n    const ids = new Set([...mentioned, ...active]);\n    return foregroundNpcCandidates(state, { foregroundCurrentUserText: visible })\n        .filter(npc => ids.has(npc.id))\n        .slice(0, Math.max(1, Math.min(20, Number(limit) || 12)));\n}\n"""
new_relevant = """function scannerShortIdentityCandidates(npc = {}) {\n    const out = [];\n    for (const label of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {\n        const words = normalizeName(label).split(/\\s+/).filter(Boolean);\n        if (words.length < 2) continue;\n        for (const token of [words[0], words.at(-1)]) {\n            if (token.length < 2 || out.includes(token)) continue;\n            out.push(token);\n        }\n    }\n    return out;\n}\n\nfunction explicitlyMentionedNpcIds(state, visible) {\n    const npcs = Array.isArray(state?.npcs) ? state.npcs : [];\n    const mentioned = new Set();\n    const shortOwners = new Map();\n    for (const npc of npcs) {\n        const labels = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])].filter(Boolean);\n        if (labels.some(label => containsNormalizedPhrase(visible, label))) mentioned.add(npc.id);\n        for (const token of scannerShortIdentityCandidates(npc)) {\n            if (!shortOwners.has(token)) shortOwners.set(token, new Set());\n            shortOwners.get(token).add(npc.id);\n        }\n    }\n    for (const [token, owners] of shortOwners) {\n        if (owners.size === 1 && containsNormalizedPhrase(visible, token)) mentioned.add([...owners][0]);\n    }\n    return mentioned;\n}\n\nfunction relevantNpcsForExchange(state, exchange, limit = 12) {\n    const visible = [exchange?.user?.mes, exchange?.assistant?.mes].map(value => scannerEvidenceText(value || '')).filter(Boolean).join('\\n');\n    const active = new Set([\n        ...(state?.lastObservation?.exchangeActiveNpcIds || []),\n        ...(state?.lastObservation?.finalPresentNpcIds || []),\n        ...(state?.lastObservation?.worldActiveNpcIds || []),\n    ]);\n    const mentioned = explicitlyMentionedNpcIds(state, visible);\n    for (const npc of state?.npcs || []) if (npc?.present || npc?.worldActive) active.add(npc.id);\n    const limitValue = Math.max(1, Math.min(20, Number(limit) || 12));\n    const explicit = (state?.npcs || []).filter(npc => mentioned.has(npc.id))\n        .sort((a, b) => runtimeNpcSalience(b) - runtimeNpcSalience(a) || String(a.name || '').localeCompare(String(b.name || '')));\n    const ordinary = foregroundNpcCandidates(state, { foregroundCurrentUserText: visible })\n        .filter(npc => active.has(npc.id) && !mentioned.has(npc.id));\n    const out = [];\n    const seen = new Set();\n    for (const npc of [...explicit, ...ordinary]) {\n        if (!npc?.id || seen.has(npc.id)) continue;\n        seen.add(npc.id);\n        out.push(npc);\n        if (out.length >= limitValue) break;\n    }\n    return out;\n}\n"""
replace('src/scan-prompts.js', old_relevant, new_relevant)

# 4. Preserve original quote context when validating shortened Current Dynamic evidence excerpts.
insert_anchor = """function relationshipQuoteComparable(value, max = 40000) {\n"""
quote_helpers = """function quotedDialogueSegments(value) {\n    const text = String(value || '');\n    const out = [];\n    let start = -1;\n    let close = '';\n    const closesFor = char => ({ '\"': '\"', '“': '”', '„': '”', '«': '»', '‘': '’' }[char] || '');\n    for (let index = 0; index < text.length; index += 1) {\n        const char = text[index];\n        if (start >= 0) {\n            if (char === close) {\n                out.push(text.slice(start, index));\n                start = -1;\n                close = '';\n            }\n            continue;\n        }\n        const expected = closesFor(char);\n        if (expected) {\n            start = index + 1;\n            close = expected;\n        }\n    }\n    return out;\n}\n\nfunction excerptInsideQuotedDialogue(excerpt, sourceText) {\n    const quote = relationshipQuoteComparable(excerpt, 1200);\n    if (!quote) return false;\n    return quotedDialogueSegments(sourceText).some(segment => relationshipQuoteComparable(segment, 40000).includes(quote));\n}\n\n"""
# Must insert after relationshipQuoteComparable definition, so add helpers immediately before exported matcher instead.
old_match = """export function relationshipEvidenceExcerptMatch(excerpt, sources = []) {\n    const quote = relationshipQuoteComparable(excerpt, 1200);\n    if (!quote) return null;\n    for (const raw of Array.isArray(sources) ? sources.slice(0, 8) : []) {\n        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;\n        const source = relationshipQuoteComparable(raw.text, 40000);\n        if (!source || !source.includes(quote)) continue;\n        return {\n            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),\n            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',\n        };\n    }\n    return null;\n}\n"""
new_match = quote_helpers + """export function relationshipEvidenceExcerptMatch(excerpt, sources = []) {\n    const quote = relationshipQuoteComparable(excerpt, 1200);\n    if (!quote) return null;\n    for (const raw of Array.isArray(sources) ? sources.slice(0, 8) : []) {\n        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;\n        const sourceText = String(raw.text || '');\n        const source = relationshipQuoteComparable(sourceText, 40000);\n        if (!source || !source.includes(quote)) continue;\n        return {\n            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),\n            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',\n            insideQuotedDialogue: excerptInsideQuotedDialogue(excerpt, sourceText),\n        };\n    }\n    return null;\n}\n"""
replace('src/relationship-evidence.js', old_match, new_match)
replace('src/scan-relationships.js',
"function playerMentioned(excerpt, playerName, npcNames = []) {\n    if (containsNormalizedPhrase(excerpt, playerName) && !identityShortTokenAmbiguous(playerName, npcNames)) return true;\n    const short = shortActivityIdentityCandidates({ name: playerName, aliases: [] });\n    if (short.some(candidate => containsNormalizedPhrase(excerpt, candidate) && !identityShortTokenAmbiguous(candidate, npcNames))) return true;\n    return /\\b(?:you|your|yours|yourself)\\b/i.test(narrationOutsideQuotedDialogue(excerpt));\n}\n",
"function playerMentioned(excerpt, playerName, npcNames = [], { allowNarratorSecondPerson = true } = {}) {\n    if (containsNormalizedPhrase(excerpt, playerName) && !identityShortTokenAmbiguous(playerName, npcNames)) return true;\n    const short = shortActivityIdentityCandidates({ name: playerName, aliases: [] });\n    if (short.some(candidate => containsNormalizedPhrase(excerpt, candidate) && !identityShortTokenAmbiguous(candidate, npcNames))) return true;\n    return allowNarratorSecondPerson && /\\b(?:you|your|yours|yourself)\\b/i.test(narrationOutsideQuotedDialogue(excerpt));\n}\n")
replace('src/scan-relationships.js',
"    if (!excerpts.every(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources))) return { ok: false, reason: 'out-of-scope-summary-evidence' };\n\n    const subjectNames",
"    const excerptMatches = excerpts.map(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources));\n    if (excerptMatches.some(match => !match)) return { ok: false, reason: 'out-of-scope-summary-evidence' };\n\n    const subjectNames")
replace('src/scan-relationships.js',
"    const targetBound = excerpts.some(excerpt => identityMentioned(excerpt, subjectNames, otherNpcNames)\n        && playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames]));\n",
"    const targetBound = excerpts.some((excerpt, index) => identityMentioned(excerpt, subjectNames, otherNpcNames)\n        && playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames], { allowNarratorSecondPerson: excerptMatches[index]?.insideQuotedDialogue !== true }));\n")

# 5. Restore bounded profileEvolutionEvidence accumulation inside the current semantic pipeline.
replace('src/model/semantic-updates.js',
"    normalizeNpc,\n} from '../schema.js';\n",
"    normalizeNpc,\n    normalizeProfileEvolutionEvidence,\n} from '../schema.js';\n")
replace('src/model/semantic-updates.js',
"const AGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);\n",
"const AGE_KINDS = new Set(['birthday', 'elapsed', 'correction']);\nconst PROFILE_EVOLUTION_FIELDS = new Set(['personality', 'behaviorProfile', 'speech', 'mannerisms']);\n")
writer_anchor = """function manualProtected(npc, field) {\n    return dossierFieldManualProtected(npc, field);\n}\n\n"""
writer = writer_anchor + """function profileEvolutionConcept(update, result = {}) {\n    if (SCALAR_FIELDS.has(update.field)) return compact(update.value || update.explanation || update.field, 180);\n    const changes = Array.isArray(update.changes) ? update.changes : [];\n    const values = changes.filter(change => ['add', 'replace'].includes(String(change?.action || ''))).map(change => compact(change?.value, 180)).filter(Boolean);\n    if (values.length) return compact(values.join('; '), 180);\n    if (Array.isArray(update.value)) return compact(update.value.join('; '), 180);\n    return compact(update.explanation || result.reason || update.field, 180);\n}\n\nfunction profileEvolutionMode(update) {\n    if (Array.isArray(update?.changes) && update.changes.length > 1) return 'batch';\n    if (update?.operation === 'refine') return 'refine';\n    if (update?.operation === 'replace' || update?.operation === 'remove') return 'explicit';\n    return 'gradual';\n}\n\nfunction appendProfileEvolutionEvidence(npc, update, provenanceRows, options = {}, result = {}) {\n    if (!PROFILE_EVOLUTION_FIELDS.has(update.field) || !result.changed) return;\n    const rows = Array.isArray(provenanceRows) ? provenanceRows : [];\n    const concept = profileEvolutionConcept(update, result);\n    const evidence = compact(rows.map(row => row.excerpt).filter(Boolean).join(' | '), 600);\n    if (!concept || !evidence) return;\n    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;\n    const turn = Number.isInteger(options.turn) ? options.turn : null;\n    const existing = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence);\n    const duplicate = existing.some(entry => entry.field === update.field\n        && normalizeName(entry.concept) === normalizeName(concept)\n        && (sourceMessageId !== null ? entry.sourceMessageId === sourceMessageId : (turn !== null && entry.sourceMessageId == null && entry.turn === turn)));\n    if (duplicate) return;\n    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...existing, {\n        field: update.field,\n        mode: profileEvolutionMode(update),\n        concept,\n        evidence,\n        sourceMessageId,\n        turn,\n        at: Date.now(),\n    }]);\n}\n\n"""
replace('src/model/semantic-updates.js', writer_anchor, writer)
replace('src/model/semantic-updates.js',
"            if (result.changed) npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n",
"            if (result.changed) {\n                appendProfileEvolutionEvidence(npc, update, provenance.rows, options, result);\n                npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n            }\n")

# Strengthen the existing synchronization regression so it proves the external interceptor waits.
p = Path('tests/post-response-rework.test.mjs')
text = p.read_text()
old = """    let aborted = false;\n    const gate = h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, () => { aborted = true; });\n    release.resolve();\n"""
new = """    let aborted = false;\n    let gateSettled = false;\n    const gate = h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, () => { aborted = true; });\n    gate.finally(() => { gateSettled = true; });\n    await new Promise(resolve => setTimeout(resolve, 10));\n    assert.equal(gateSettled, false, 'ordinary next-turn interceptor must actually wait while the previous scan is pending');\n    release.resolve();\n"""
if old not in text: raise SystemExit('missing post-response wait-test anchor')
p.write_text(text.replace(old, new, 1))

# Focused regressions for all five reported groups.
Path('tests/v0512-gap-fixes.test.mjs').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { applyScanResult, buildScanPrompt } from '../src/scanner.js';
import { applyRelationshipSummaryProjection } from '../src/scan-relationships.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { DOSSIER_EVALUATION_GROUPS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';

const EMPTY = { exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] };
const ZERO_REL = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'No score movement.' };
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function bessaState(overrides = {}) {
    const state = createEmptyState('chat:test');
    state.npcs = [normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond', role: 'Front desk clerk', ...overrides })];
    return state;
}

function semanticPatch(id, updates) {
    const proposed = new Set(updates.map(update => update.field));
    return {
        id, name: 'Bessa Vond', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS],
        fieldEvaluations: { unchanged: [], insufficient: DOSSIER_SEMANTIC_FIELDS.filter(field => !proposed.has(field)), unavailable: [] },
        semanticUpdates: updates, relationshipChange: structuredClone(ZERO_REL),
    };
}

test('real assistant completion while another scanner request is pending is queued and scanned, not suppressed as scanner-generation', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'First turn.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'The first response.' },
    ];
    const entered = deferred(), release = deferred();
    let calls = 0;
    h.context.generateRaw = async () => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) { entered.resolve(); await release.promise; }
        return JSON.stringify(EMPTY);
    };
    const first = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat.push({ is_user: true, name: 'Ari', mes: 'Second turn.' });
    h.context.chat.push({ is_user: false, name: 'Assistant', swipe_id: 0, mes: 'The second response.' });
    let secondSettled = false;
    const second = h.entry.processCompletedAssistantResponse(3);
    second.finally(() => { secondSettled = true; });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(secondSettled, false);
    release.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);
    assert.equal(firstResult.ok, true);
    assert.equal(secondResult.ok, true);
    assert.notEqual(secondResult.reason, 'scanner-generation');
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().lastScannedMessageId, 3);
}));

test('routine Scan includes a uniquely short-mentioned inactive existing dossier', () => {
    const state = bessaState({ present: false, worldActive: false });
    const chat = [{ is_user: true, mes: 'I look toward the counter.' }, { is_user: false, mes: 'Bessa returns and opens the ledger.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    assert.match(prompt, /npc-bessa-vond/);
    assert.match(prompt, /Bessa Vond/);
});

test('routine Scan does not guess an ambiguous short identity', () => {
    const state = bessaState();
    state.npcs.push(normalizeNpc({ id: 'npc-bessa-hale', name: 'Bessa Hale' }));
    const chat = [{ is_user: true, mes: 'I wait.' }, { is_user: false, mes: 'Bessa returns and opens the ledger.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const relevant = prompt.split('RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):')[1].split('OLDER REFERENCE CONTEXT')[0];
    assert.doesNotMatch(relevant, /npc-bessa-vond/);
    assert.doesNotMatch(relevant, /npc-bessa-hale/);
});

test('explicitly mentioned archived deceased dossier remains available to resurrection extraction', () => {
    const state = bessaState({ archived: true, archiveReason: 'deceased', lifeState: 'dead', lifeStateCertainty: 'explicit' });
    const chat = [{ is_user: true, mes: 'I stare at the doorway.' }, { is_user: false, mes: 'Bessa Vond returns alive and steps through the doorway.' }];
    const prompt = buildScanPrompt({ state, chat, assistantMessageId: 1 });
    const relevant = prompt.split('RELEVANT EXISTING DOSSIERS (compact; unrelated roster omitted):')[1].split('OLDER REFERENCE CONTEXT')[0];
    assert.match(relevant, /npc-bessa-vond/);
    assert.match(relevant, /dead/);
});

test('retry of a partial automatic scan forces a same-boundary semantic rescan instead of relabeling already-scanned as complete', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'I approach the counter.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'Bessa Vond stands behind the counter. Her brow furrows as she studies the form.' },
    ];
    const firstPayload = {
        ...EMPTY, exchangeActiveNpcIds: ['Bessa Vond'], inChatNpcIds: ['Bessa Vond'],
        npcs: [{ id: '', name: 'Bessa Vond', identityKind: 'named',
            identityEvidence: { anchor: 'Bessa Vond', excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Named in current response.' },
            activityEvidence: { exchangeActive: { excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Directly present.' }, inChat: { excerpts: ['Bessa Vond stands behind the counter.'], explanation: 'Remains at counter.' } },
            appearance: 'A clerk behind the counter.', evaluatedGroups: [...DOSSIER_EVALUATION_GROUPS], relationshipChange: structuredClone(ZERO_REL) }],
    };
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload); };
    const first = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(first.ok, true);
    assert.equal(h.api.scanStatus().status, 'partial');
    const id = h.persisted().npcs[0].id;
    const secondPayload = { ...EMPTY, exchangeActiveNpcIds: [id], inChatNpcIds: [id], npcs: [semanticPatch(id, [{
        field: 'mood', operation: 'establish', value: 'Focused and mildly concerned.',
        sources: [{ messageId: 1, excerpt: 'Her brow furrows as she studies the form.' }], explanation: 'Current visible expression establishes mood.'
    }])] };
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(secondPayload); };
    const retry = await h.api.retryAutoScan();
    assert.equal(retry.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().npcs[0].mood, 'Focused and mildly concerned.');
    assert.equal(h.api.scanStatus().status, 'complete');
    assert.deepEqual(h.persisted().npcs[0].relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(h.persisted().npcs[0].relationshipHistory.length, 0);
}));

test('successful manual Scan adopts the same failed automatic boundary and unblocks next generation', () => withHost(async h => {
    h.context.chat = [
        { is_user: true, name: 'Ari', mes: 'I approach the counter.' },
        { is_user: false, name: 'Assistant', swipe_id: 0, mes: 'Bessa Vond stands behind the counter.' },
    ];
    h.context.generateRaw = async () => { h.metrics.generations += 1; throw new Error('automatic fixture failure'); };
    const failed = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(failed.ok, false);
    assert.equal(h.api.scanStatus().status, 'failed');
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(EMPTY); };
    const manual = await h.api.scan();
    assert.equal(manual.ok, true);
    assert.notEqual(h.api.scanStatus().status, 'failed');
    h.context.chat.push({ is_user: true, name: 'Ari', mes: 'I continue.' });
    let aborted = false;
    await h.entry.npcStateGenerationInterceptor(h.context.chat, 8192, () => { aborted = true; });
    assert.equal(aborted, false);
}));

test('shortened quoted second-person Current Dynamic evidence keeps its original dialogue context and is rejected', () => {
    const npc = normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond' });
    const patch = {
        relationshipSummary: 'A direct professional exchange with Ari.',
        relationshipSummaryEvidence: { excerpts: ['Bessa, you should take the quill.'], explanation: 'Bessa directly addresses the player.' },
        relationshipChange: structuredClone(ZERO_REL),
    };
    const diagnostics = [];
    const updated = applyRelationshipSummaryProjection(npc, patch, {
        playerName: 'Ari', otherNpcNames: ['Mira Vale'], relationshipSummaryDiagnostics: diagnostics,
        relationshipEvidenceSources: [{ id: 'assistant:1', kind: 'visible', text: 'Mira Vale told Bessa Vond, “Bessa, you should take the quill.”' }],
    });
    assert.equal(updated.relationshipSummary, '');
    assert.equal(diagnostics.at(-1)?.reason, 'wrong-summary-target');
});

test('narrator second-person Current Dynamic evidence outside dialogue remains valid', () => {
    const npc = normalizeNpc({ id: 'npc-bessa-vond', name: 'Bessa Vond' });
    const text = 'Bessa Vond nudged the quill into your fingers.';
    const updated = applyRelationshipSummaryProjection(npc, {
        relationshipSummary: 'A direct professional clerk-applicant interaction.',
        relationshipSummaryEvidence: { excerpts: [text], explanation: text }, relationshipChange: structuredClone(ZERO_REL),
    }, { playerName: 'Ari', otherNpcNames: [], relationshipEvidenceSources: [{ id: 'assistant:1', kind: 'visible', text }] });
    assert.equal(updated.relationshipSummary, 'A direct professional clerk-applicant interaction.');
});

test('applied profile semantic updates accumulate bounded source-owned evolution evidence across exchanges without retry duplication', () => {
    let state = bessaState({ speech: 'Formal and terse.' });
    const firstText = 'Bessa Vond now answers with clipped practical instructions.';
    let applied = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'speech', operation: 'replace', value: 'Clipped and practical.', sources: [{ messageId: 1, excerpt: firstText }], explanation: 'Later speech is directly established.'
    }])] }, {
        sourceMessageId: 1, turn: 1, profileContext: firstText, currentAdmissionText: firstText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    state = applied.state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 1);
    assert.equal(state.npcs[0].profileEvolutionEvidence[0].field, 'speech');
    assert.equal(state.npcs[0].profileEvolutionEvidence[0].sourceMessageId, 1);
    const secondText = 'Bessa Vond taps the ledger twice before answering difficult questions.';
    applied = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'mannerisms', operation: 'establish', changes: [{ action: 'add', value: 'Observed tapping the ledger twice before difficult answers.' }], sources: [{ messageId: 3, excerpt: secondText }], explanation: 'A new observed gesture is recorded narrowly.'
    }])] }, {
        sourceMessageId: 3, turn: 2, profileContext: secondText, currentAdmissionText: secondText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    state = applied.state;
    assert.equal(state.npcs[0].profileEvolutionEvidence.length, 2);
    assert.deepEqual(state.npcs[0].profileEvolutionEvidence.map(row => row.sourceMessageId), [1, 3]);
    const replay = applyScanResult(state, { ...EMPTY, npcs: [semanticPatch('npc-bessa-vond', [{
        field: 'mannerisms', operation: 'establish', changes: [{ action: 'add', value: 'Observed tapping the ledger twice before difficult answers.' }], sources: [{ messageId: 3, excerpt: secondText }], explanation: 'Retry of same observation.'
    }])] }, {
        sourceMessageId: 3, turn: 3, profileContext: secondText, currentAdmissionText: secondText,
        applyReturnedNpcPatches: true, applyRelationship: false, preservePresence: true, preserveObservation: true,
    });
    assert.equal(replay.state.npcs[0].profileEvolutionEvidence.length, 2);
});
''')

print('Applied v0.5.12 source/test fixes')
