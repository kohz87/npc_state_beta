from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

def write(path, content):
    (ROOT / path).write_text(content)

# Release metadata.
replace_once('src/schema.js', "export const NPC_STATE_VERSION = '0.5.31';", "export const NPC_STATE_VERSION = '0.5.32';")
replace_once('manifest.json', '"version": "0.5.31"', '"version": "0.5.32"')
replace_once('DEVELOPMENT.md', '- Extension release: `0.5.31`', '- Extension release: `0.5.32`')
replace_once('tests/structure.test.mjs', "assert.equal(manifest.version, '0.5.31');\n    assert.match(schema, /NPC_STATE_VERSION = '0.5.31'/);", "assert.equal(manifest.version, '0.5.32');\n    assert.match(schema, /NPC_STATE_VERSION = '0.5.32'/);")

# Birthday generation remains internal deterministic metadata, not user/model-facing provenance.
replace_once('src/dossier-view.js', "function birthdayIsGenerated(npc = {}) {\n    return npc?.birthdayProvenance === 'generated';\n}\n\n", '')
replace_once('src/dossier-view.js', "        npc.birthday ? `Birthday ${npc.birthday}${birthdayIsGenerated(npc) ? ' (generated)' : ''}` : '',", "        npc.birthday ? `Birthday ${npc.birthday}` : '',")
replace_once('src/dossier-view.js', "            ${currentFact(birthdayIsGenerated(npc) ? 'Birthday (generated)' : 'Birthday', npc.birthday)}", "            ${currentFact('Birthday', npc.birthday)}")
replace_once('src/foreground-context.js', "        birthdayProvenance: npc.birthdayProvenance === 'generated' ? 'generated' : '',\n", '')
replace_once('src/foreground-context.js', "npc.id, npc.name, (npc.aliases || []).join('|'), npc.role, npc.species, npc.age, npc.apparentAge, npc.birthday, npc.birthdayProvenance === 'generated' ? 'generated' : '',", "npc.id, npc.name, (npc.aliases || []).join('|'), npc.role, npc.species, npc.age, npc.apparentAge, npc.birthday,")
replace_once('src/scan-prompts.js', "            birthday: npc.birthday,\n            birthdayProvenance: npc.birthdayProvenance,\n", "            birthday: npc.birthday,\n")

# First-contact completion prompt: current exchange only, admitted targets only, unresolved ordinary fields only.
marker = "export function buildStructuredDossierImportPrompt({ npc, blocks = [], memoryCriteria = '', dossierLimits = {} }) {"
completion_prompt = r'''export function buildFirstContactCompletionPrompt({ targets = [], chat, assistantMessageId, playerName = '', memoryCriteria = '', dossierLimits = {} }) {
    const exchange = currentExchange(chat, assistantMessageId);
    if (!exchange) throw new Error('NPC State first-contact completion requires a completed assistant message.');
    const activePlayerName = resolvePlayerName(playerName, chat, assistantMessageId);
    const limits = normalizeDossierLimits(dossierLimits);
    const rows = (Array.isArray(targets) ? targets : []).map(target => ({
        dossier: rosterForPrompt({ npcs: [target?.npc] })[0],
        unresolvedFields: [...new Set((Array.isArray(target?.fields) ? target.fields : []).map(value => String(value || '').trim()).filter(Boolean))],
    })).filter(row => row.dossier?.id && row.unresolvedFields.length);
    const targetNpcs = rows.map(row => row.dossier).map(row => (stateNpc => stateNpc)(row));
    const sourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);
    const structuredDetected = [exchange.user?.mes, exchange.assistant?.mes].some(hasRecognizedStructuredBlocks);
    return [
        'You are NPC State performing a FIRST-CONTACT COMPLETION CHECK inside the same automatic Scan operation. Return exactly one valid JSON object, no markdown/commentary.',
        `PLAYER IDENTITY: ${JSON.stringify({ name: activePlayerName })}`,
        `ADMITTED TARGETS AND ONLY FIELDS TO RECHECK:\n${JSON.stringify(rows)}`,
        'Identity/admission already succeeded. Do not create NPCs, rename targets, revisit presence/activity, relationship scores/Current Dynamic, lifecycle, family/social graph, or any field not listed for that target.',
        'Use ONLY the complete CURRENT USER + ASSISTANT exchange below as evidence. This is not historical Refresh/backfill. Reconsider each listed unresolved field once; propose a narrow grounded value when directly supported, otherwise keep it insufficient. Never fill a field merely because it is blank.',
        ...dossierExtractionPromptRules({ includeNew: false, includeExisting: true }),
        ...(structuredDetected ? structuredEvidencePromptRules() : []),
        memoryCriteria ? `IMPORTANT MEMORY RUBRIC (user-authored; preserve as supplied):\n${compactText(memoryCriteria, 6000)}` : '',
        `CURRENT USER MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.user?.mes || '')}`,
        `CURRENT ASSISTANT MESSAGE (complete event evidence):\n${scannerEvidenceText(exchange.assistant?.mes || '')}`,
        'All top-level activity/presence/world/social/family/lifecycle arrays must be empty. NPC patches must keep the supplied stable id and use only semanticUpdates/profileObservations/fieldEvaluations for that target\'s listed fields.',
        scanOutputContract({ includeNew: false, includeRelationship: false, compact: true }),
        semanticAppend({ npcs: targetNpcs, mode: 'first-contact', sourceIds }),
    ].filter(Boolean).join('\n\n');
}

'''
replace_once('src/scan-prompts.js', marker, completion_prompt + marker)
# Simplify targetNpcs to the actual state dossier objects supplied by the caller rather than prompt rows.
replace_once('src/scan-prompts.js', "    const targetNpcs = rows.map(row => row.dossier).map(row => (stateNpc => stateNpc)(row));", "    const targetNpcs = (Array.isArray(targets) ? targets : []).map(target => target?.npc).filter(npc => npc?.id);")

replace_once('src/scanner.js', "export { SCAN_SYSTEM_PROMPT, recentHistory, relevantNpcsForExchange, buildScanPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from './scan-prompts.js';", "export { SCAN_SYSTEM_PROMPT, recentHistory, relevantNpcsForExchange, buildScanPrompt, buildFirstContactCompletionPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from './scan-prompts.js';")

# Engine completion helpers and wiring.
replace_once('src/engine.js', "import { resolvePlayerName } from './scan-helpers.js';", "import { resolvePlayerName } from './scan-helpers.js';\nimport { DOSSIER_SEMANTIC_FIELDS, dossierFieldDefinition } from './model/dossier-fields.js';")
replace_once('src/engine.js', "    buildScanPrompt,\n    buildStructuredDossierImportPrompt,", "    buildScanPrompt,\n    buildFirstContactCompletionPrompt,\n    buildStructuredDossierImportPrompt,")

engine_marker = "function lifecycleNotice(result) {"
engine_helpers = r'''function firstContactFieldMissing(npc = {}, field = '') {
    const definition = dossierFieldDefinition(field);
    if (!definition) return false;
    const value = npc?.[field];
    if (definition.kind === 'collection' || definition.kind === 'forms') return !Array.isArray(value) || value.length === 0;
    const clean = String(value ?? '').trim();
    return !clean || normalizeName(clean) === 'unknown';
}

function firstContactCompletionTargets(beforeState = {}, afterState = {}) {
    const existingIds = new Set((beforeState?.npcs || []).map(npc => npc?.id).filter(Boolean));
    return (afterState?.npcs || []).filter(npc => npc?.id && !existingIds.has(npc.id)).map(npc => ({
        npc,
        fields: DOSSIER_SEMANTIC_FIELDS.filter(field => firstContactFieldMissing(npc, field)),
    })).filter(target => target.fields.length);
}

function filterFirstContactFieldEvaluations(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const out = {};
    for (const key of ['unchanged', 'insufficient', 'unavailable']) {
        const rows = [...new Set((Array.isArray(value[key]) ? value[key] : []).map(item => String(item || '').trim()).filter(field => allowed.has(field)))];
        if (rows.length) out[key] = rows;
    }
    return Object.keys(out).length ? out : undefined;
}

function sanitizeFirstContactCompletionPayload(result = {}, targets = []) {
    const byId = new Map();
    const byName = new Map();
    for (const target of Array.isArray(targets) ? targets : []) {
        if (!target?.npc?.id) continue;
        const row = { npc: target.npc, allowed: new Set(target.fields || []) };
        byId.set(target.npc.id, row);
        const name = normalizeName(target.npc.name);
        if (name) byName.set(name, row);
    }
    const npcs = [];
    const seen = new Set();
    for (const patch of Array.isArray(result?.npcs) ? result.npcs : []) {
        const patchId = String(patch?.id || '').trim();
        const target = byId.get(patchId) || byName.get(normalizeName(patch?.name));
        if (!target || seen.has(target.npc.id)) continue;
        seen.add(target.npc.id);
        const semanticUpdates = (Array.isArray(patch?.semanticUpdates) ? patch.semanticUpdates : [])
            .filter(update => target.allowed.has(String(update?.field || '').trim()))
            .map(update => structuredClone(update));
        const profileObservations = (Array.isArray(patch?.profileObservations) ? patch.profileObservations : [])
            .filter(observation => target.allowed.has(String(observation?.field || '').trim()))
            .map(observation => structuredClone(observation));
        const fieldEvaluations = filterFirstContactFieldEvaluations(patch?.fieldEvaluations, target.allowed);
        const groups = [...new Set([...target.allowed].map(field => dossierFieldDefinition(field)?.group).filter(Boolean))];
        npcs.push({
            id: target.npc.id,
            name: target.npc.name,
            ...(groups.length ? { evaluatedGroups: groups } : {}),
            ...(semanticUpdates.length ? { semanticUpdates } : {}),
            ...(profileObservations.length ? { profileObservations } : {}),
            ...(fieldEvaluations ? { fieldEvaluations } : {}),
        });
    }
    return {
        exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs,
        socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}

'''
replace_once('src/engine.js', engine_marker, engine_helpers + engine_marker)

old_apply = """            const working = ensurePreUpdateBaseline(normalizeState(state, chatKey), chat, messageId);\n            working.turn = Math.max(0, Number(working.turn) || 0) + 1;\n            const applied = applyScanResult(working, parsed, {\n                sourceMessageId: messageId,\n                ...profileEvidenceSourceOptions(chatKey, chat, messageId, [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger)),\n                turn: working.turn,\n                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', chat, messageId),\n                relationshipContext: relationshipContextForExchange(exchange),\n                // Routine scan validates new evidence against the owned exchange. Saved\n                // profile-evolution observations remain available through dossier state.\n                profileContext: profileContextForExchange(exchange),\n                evidencePolicy: buildExchangeEvidencePolicy(exchange),\n                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                admissionMode: settings.newNpcAdmissionMode,\n                dossierLimits: settings.dossierLimits,\n                birthdayFill: {\n                    mode: settings.birthdayFillMode,\n                    calendar: settings.birthdayRandomCalendar,\n                    fallbackDays: settings.birthdayRandomDaysPerMonth,\n                },\n                applyReturnedNpcPatches: true,\n                coverageNpcIds: candidateNpcIds,\n                requireDossierCoverage: true,\n                requireCandidateAccounting: true,\n                applyRelationship: relationshipApplyRequested && !replayProtectedRelationship,\n                repairRelationshipSummary: manual,\n            });\n            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);"""
new_apply = """            const working = ensurePreUpdateBaseline(normalizeState(state, chatKey), chat, messageId);\n            working.turn = Math.max(0, Number(working.turn) || 0) + 1;\n            const exchangeSourceIds = [exchange.user?.id, exchange.assistant?.id].filter(Number.isInteger);\n            const evidencePolicy = buildExchangeEvidencePolicy(exchange);\n            const semanticSourceOptions = profileEvidenceSourceOptions(chatKey, chat, messageId, exchangeSourceIds);\n            let applied = applyScanResult(working, parsed, {\n                sourceMessageId: messageId,\n                ...semanticSourceOptions,\n                turn: working.turn,\n                relationshipCaps: settings.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,\n                playerName: resolvePlayerName('', chat, messageId),\n                relationshipContext: relationshipContextForExchange(exchange),\n                // Routine scan validates new evidence against the owned exchange. Saved\n                // profile-evolution observations remain available through dossier state.\n                profileContext: profileContextForExchange(exchange),\n                evidencePolicy,\n                currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                admissionMode: settings.newNpcAdmissionMode,\n                dossierLimits: settings.dossierLimits,\n                birthdayFill: {\n                    mode: settings.birthdayFillMode,\n                    calendar: settings.birthdayRandomCalendar,\n                    fallbackDays: settings.birthdayRandomDaysPerMonth,\n                },\n                applyReturnedNpcPatches: true,\n                coverageNpcIds: candidateNpcIds,\n                requireDossierCoverage: true,\n                requireCandidateAccounting: true,\n                applyRelationship: relationshipApplyRequested && !replayProtectedRelationship,\n                repairRelationshipSummary: manual,\n            });\n\n            if (!manual) {\n                const completionTargets = firstContactCompletionTargets(working, applied.state);\n                if (completionTargets.length) {\n                    const completionPrompt = buildFirstContactCompletionPrompt({\n                        targets: completionTargets, chat, assistantMessageId: messageId,\n                        playerName: resolvePlayerName('', chat, messageId),\n                        memoryCriteria: settings.memoryCriteria, dossierLimits: settings.dossierLimits,\n                    });\n                    try {\n                        const completionRaw = await invokeJson(completionPrompt, 'automatic-first-contact-completion', signal);\n                        const postCompletionChat = getContext().chat || [];\n                        if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, postCompletionChat, messageId))) {\n                            finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'post-first-contact-completion');\n                            return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };\n                        }\n                        const completionParsed = sanitizeFirstContactCompletionPayload(completionRaw, completionTargets);\n                        const completionApplied = applyScanResult(applied.state, completionParsed, {\n                            sourceMessageId: messageId, ...semanticSourceOptions, turn: working.turn,\n                            preservePresence: true, preserveObservation: true, applyRelationship: false,\n                            reconcileFamilyGraph: false, allowHistoricalProfilePatches: true,\n                            playerName: resolvePlayerName('', chat, messageId), dossierLimits: settings.dossierLimits,\n                            profileContext: profileContextForExchange(exchange), evidencePolicy,\n                            currentAdmissionText: [exchange.user?.mes, exchange.assistant?.mes].map(value => profileEvidenceText(value)).filter(Boolean).join('\\n'),\n                            birthdayFill: {\n                                mode: settings.birthdayFillMode, calendar: settings.birthdayRandomCalendar,\n                                fallbackDays: settings.birthdayRandomDaysPerMonth,\n                            },\n                            applyReturnedNpcPatches: true,\n                        });\n                        applied = {\n                            ...applied, state: completionApplied.state,\n                            semanticDiagnostics: [...(applied.semanticDiagnostics || []), ...(completionApplied.semanticDiagnostics || [])],\n                            coverageDiagnostics: [...(applied.coverageDiagnostics || []), ...(completionApplied.coverageDiagnostics || [])],\n                        };\n                    } catch (error) {\n                        if (signal?.aborted) {\n                            finishDiscardedOperation(operationId, 'scan-cancelled', 'first-contact-completion');\n                            return { ok: false, discarded: true, reason: 'scan-cancelled', messageId };\n                        }\n                        const reason = String(error?.message || error).slice(0, 300);\n                        applied.coverageDiagnostics = [\n                            ...(applied.coverageDiagnostics || []),\n                            ...completionTargets.map(target => ({ npcId: target.npc.id, status: 'first-contact-completion-failed', coverageKind: 'first-contact-completion', reason })),\n                        ];\n                    }\n                }\n            }\n\n            applied.state = trimStateRelationshipHistory(applied.state, relationshipHistoryLimit);"""
replace_once('src/engine.js', old_apply, new_apply)

replace_once('src/post-response-coordinator.js', "            'invalid-candidate-accounting', 'candidate-unresolved', 'candidate-accounting-conflict',\n", "            'invalid-candidate-accounting', 'candidate-unresolved', 'candidate-accounting-conflict',\n            'first-contact-completion-failed',\n")

# Update v0.5.31 regressions to the corrected birthday visibility contract while retaining internal provenance.
write('tests/v0531-live-evidence-birthday-provenance.test.mjs', r'''import test from 'node:test';
import assert from 'node:assert/strict';

import { dossierHtml } from '../src/dossier-view.js';
import { structuredEvidencePromptRules } from '../src/evidence-adapter.js';
import { compactForegroundNpc, foregroundStateRevisionSignature } from '../src/foreground-context.js';
import { dossierExtractionPromptRules } from '../src/scan-helpers.js';

function npc(overrides = {}) {
    return {
        id: 'npc-tessa', name: 'Tessa Morren', aliases: [], role: 'Guild Intake Clerk', species: '', age: '', apparentAge: '~23',
        birthday: '23 Thawrise', birthdayProvenance: 'generated', appearance: 'A young woman in a wool waistcoat and ink-stained linen sleeves.',
        currentForm: '', appearanceForms: [], personality: '', behaviorProfile: [], speech: '', mannerisms: [], keyRelationships: [], memories: [], background: '',
        mood: '', location: 'Adventurer Guild Post, Rimecross', goal: '', status: 'Processing intake paperwork.', lifeState: 'alive', relationshipSummary: '',
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 }, manualProfileFields: [], profileEvolutionEvidence: [], updatedAt: 1, ...overrides,
    };
}

test('private completeness treats supported permitted-source values as proposals, not default insufficient', () => {
    const extraction = dossierExtractionPromptRules().join('\n');
    const structured = structuredEvidencePromptRules().join('\n');
    assert.match(extraction, /directly supported values from permitted CURRENT sources are proposals, not insufficient/i);
    assert.match(structured, /NPC_Inner_Chatter> directly grounds stated current private mood\/goal/i);
    assert.match(structured, /never proves presence, action, speech, gesture, or visible reaction/i);
    assert.doesNotMatch(extraction + structured, /Gemini|provider-specific|historical backfill/i);
});

test('generated birthday provenance stays internal to compact routine scanner context', () => {
    const generated = compactForegroundNpc(npc(), 0);
    const explicit = compactForegroundNpc(npc({ birthdayProvenance: 'explicit' }), 0);
    assert.equal(generated.birthday, '23 Thawrise');
    assert.equal(explicit.birthday, '23 Thawrise');
    assert.equal(generated.birthdayProvenance, undefined);
    assert.equal(explicit.birthdayProvenance, undefined);
});

test('foreground cache signature ignores internal birthday provenance when projected continuity is identical', () => {
    const generatedState = { npcs: [npc()], lastObservation: {} };
    const explicitState = { npcs: [npc({ birthdayProvenance: 'explicit' })], lastObservation: {} };
    assert.equal(foregroundStateRevisionSignature(generatedState), foregroundStateRevisionSignature(explicitState));
});

test('dossier renders deterministic generated birthdays as ordinary stable birthdays', () => {
    const generatedHtml = dossierHtml(npc());
    assert.match(generatedHtml, /Birthday 23 Thawrise/);
    assert.match(generatedHtml, /<b>Birthday<\/b><span>23 Thawrise<\/span>/);
    assert.doesNotMatch(generatedHtml, /generated/i);
});
''')

# Add first-contact completion behavior tests.
write('tests/v0532-first-contact-completion.test.mjs', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { buildFirstContactCompletionPrompt } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';

const user = 'I enter the guild and approach the young woman receptionist.';
const visible = 'A young woman in a wool waistcoat grips your sleeve, puts a ledger before you, and says, "Name on the fifth line."';
const assistant = `${visible}\n\n<Blocks><World_State>NPCs Present:\nTessa Morren:\n* G-Rank: N/A (Guild Intake Clerk)\n* Position: Behind the registration counter</World_State><NPC_Inner_Chatter>TESSA: I need this ledger closed by dusk.</NPC_Inner_Chatter></Blocks>`;
const chat = [
    { is_user: true, name: 'Lucien Noctis', mes: user },
    { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistant },
];

function firstPayload() {
    return {
        exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: [],
        npcs: [{
            id: '', name: 'Tessa Morren', identityKind: 'named', evaluatedGroups: ['canon','profile','live','memory','npcRelationships'],
            identityEvidence: { anchor: 'young woman in a wool waistcoat', excerpts: [visible], explanation: 'The visible receptionist is Tessa Morren in current World_State.' },
            activityEvidence: { exchangeActive: { excerpts: [visible], explanation: 'She handles Lucien intake.' }, inChat: { excerpts: [visible], explanation: 'She remains at the counter.' } },
            role: 'Guild intake clerk', personality: 'Brisk and no-nonsense during intake.', location: 'Adventurer Guild Post', status: 'Processing Lucien intake paperwork.',
            relationshipChange: { evaluated: true, impact: 'none', delta: { trust:0, affection:0, desire:0, tension:0 }, axisEvidence: {}, reason: 'Initial professional interaction.' },
            relationshipSummary: 'Transactional clerk-to-applicant intake interaction.',
            relationshipSummaryEvidence: { excerpts: [visible], explanation: 'Tessa briskly processes Lucien as an applicant.' },
            fieldEvaluations: { unchanged: [], insufficient: ['species','background','age','apparentAge','birthday','appearance','appearanceForms','behaviorProfile','speech','mannerisms','mood','goal','currentForm','memories','keyRelationships'], unavailable: [] },
        }],
        socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
    };
}

function completionPayload(id) {
    return {
        exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: ['Tessa Morren'],
        npcs: [{
            id, name: 'Tessa Morren',
            personality: 'This direct field must not overwrite first-pass personality.',
            relationshipSummary: 'Must not rewrite Current Dynamic.',
            semanticUpdates: [
                { field: 'goal', operation: 'establish', value: 'Close the intake ledger by dusk.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] },
                { field: 'personality', operation: 'replace', value: 'Must be filtered because personality is already populated.', sources: [{ messageId: 1, excerpt: visible }] },
            ],
            fieldEvaluations: { unchanged: [], insufficient: ['age','species'], unavailable: [] },
        }],
        socialEdges: [{ from: id, to: 'somebody', relation: 'invented' }], familyFacts: [],
        lifeStateUpdates: [{ id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'invented' }], candidateAccounting: {},
    };
}

test('first-contact completion prompt is current-only and forbids second-pass cast/relationship authority', () => {
    const state = createEmptyState('chat:test');
    const npc = { ...state.npcs[0], id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', goal: '' };
    const prompt = buildFirstContactCompletionPrompt({ targets: [{ npc, fields: ['goal','mood'] }], chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
    assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
    assert.match(prompt, /ONLY the complete CURRENT USER \+ ASSISTANT exchange/);
    assert.match(prompt, /Do not create NPCs, rename targets, revisit presence\/activity, relationship scores\/Current Dynamic, lifecycle, family\/social graph/);
    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW \(bounded operation evidence\)/);
});

test('automatic new-NPC admission gets one bounded completion request that can fill a missed current-source goal without repainting first-pass state', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
        const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
        assert.ok(id);
        return JSON.stringify(completionPayload(id));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    const npc = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
    assert.ok(npc);
    assert.equal(npc.goal, 'Close the intake ledger by dusk.');
    assert.equal(npc.personality, 'Brisk and no-nonsense during intake.');
    assert.equal(npc.relationshipSummary, 'Transactional clerk-to-applicant intake interaction.');
    assert.equal(npc.lifeState, 'alive');
    assert.equal(npc.present, true);
    assert.equal(npc.worldActive, false);
    assert.deepEqual(npc.relationship, { trust:0, affection:0, desire:0, tension:0 });
    assert.equal(h.persisted().socialEdges.length, 0);
}), { state: createEmptyState('chat:actor.png:fixture') });

test('completion provider failure preserves the valid first pass and reports partial instead of losing admission', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async () => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        throw new Error('completion fixture unavailable');
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(h.persisted().npcs.length, 1);
    assert.ok(result.coverageDiagnostics.some(row => row.status === 'first-contact-completion-failed'));
}), { state: createEmptyState('chat:actor.png:fixture') });
''')

# Adapt the focused v0.5.30 request-count assertion to the new first-contact-only second request.
replace_once('tests/v0530-first-contact-profile.test.mjs', "        assert.equal(h.metrics.generations, 1);\n        if (mode === 'save') {", "        assert.equal(h.metrics.generations, mode === 'stale' ? 1 : 2);\n        if (mode === 'save') {")

# Core contract: one logical automatic operation may perform one bounded admission-only completion request.
replace_once('docs/core-contract.md', "Dedicated post-response scanning is the only automatic extraction mode. Normal roleplay generation receives continuity context only and never has to emit newly generated NPC JSON. Embedded first-pass extraction, automatic embedded fallback, and supplemental completeness requests are retired workflows. Manual Scan, targeted Refresh, and historical reconstruction keep their distinct scopes. Rollback enters the same commit boundary after a valid restored state has been selected.", "Dedicated post-response scanning is the only automatic extraction operation. Normal roleplay generation receives continuity context only and never has to emit newly generated NPC JSON. When that operation admits a genuinely new NPC, it may make one bounded first-contact completion request before the single persistence/checkpoint boundary, limited to that newly admitted NPC's still-unresolved ordinary dossier fields and the same current exchange. This is not a recurring completeness scan: existing cast, activity/presence, relationships, lifecycle, graph state, history, and already-populated fields are outside its authority. Embedded extraction, automatic embedded fallback, general supplemental completeness requests, and historical backfill remain retired workflows. Manual Scan, targeted Refresh, and historical reconstruction keep their distinct scopes. Rollback enters the same commit boundary after a valid restored state has been selected.")
replace_once('docs/core-contract.md', "Intentional birthday generation remains a separate extension feature. A generated birthday retains `birthdayProvenance: \"generated\"`, is identified as generated in the dossier and compact scanner context, and is fallback metadata rather than narrative evidence.", "Intentional birthday generation remains a separate extension feature. Generated birthdays remain deterministic and stable, while internal `birthdayProvenance` is bookkeeping only: normal dossier presentation and scanner continuity expose the resulting birthday like any other stored birthday and do not label it as generated. Internal provenance never becomes narrative evidence or a second extraction authority.")

# Release docs.
replace_once('README.md', "## Release 0.5.31\n\n0.5.31 tightens first-pass field accounting so directly supported values from each field's already permitted current source are proposed instead of reflexively marked insufficient. Current NPC_Inner_Chatter remains narrowly authoritative for stated private mood/goal context only. Generated birthday fallback values now retain visible provenance through compact scanner context and dossier presentation instead of looking like narrative canon. One post-response scan and continuity-only foreground injection remain unchanged.", "## Release 0.5.32\n\n0.5.32 makes first-contact creation more robust without turning every turn into a double scan. A successful automatic admission may perform one bounded completion request for only the newly admitted NPC's still-unresolved ordinary dossier fields, using the same current exchange and the same evidence firewall, before one persistence/checkpoint. It cannot repaint already-populated fields or change cast presence, relationships, lifecycle, or graph state. Deterministically generated birthdays remain internally tracked but are presented and supplied to normal scanner continuity as ordinary stable birthdays, without a `generated` label.")
replace_once('README.md', "- **0.5.31:** re-check permitted current evidence before `insufficient`, and expose synthetic birthday provenance in compact scanner context and dossier UI.\n", "- **0.5.31:** re-check permitted current evidence before `insufficient`, and expose synthetic birthday provenance in compact scanner context and dossier UI.\n- **0.5.32:** add a new-admission-only current-exchange completion request inside the same automatic operation, and return deterministic birthday provenance to internal-only bookkeeping.\n")
replace_once('README.md', "`compact continuity -> visible roleplay response -> one dedicated post-response scan -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`", "`compact continuity -> visible roleplay response -> dedicated post-response scan -> optional new-admission completion -> validate/apply -> guarded persistence/checkpoint -> refresh continuity/UI`")
replace_once('README.md', "Roleplay generation does not emit `<npc_state_v1>` or other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one dedicated scanner request after each completed assistant revision. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.", "Roleplay generation does not emit `<npc_state_v1>` or other NPC JSON. Foreground injection is continuity-only. `autoScan=true` means one logical dedicated scan operation after each completed assistant revision. Ordinary existing-cast turns use one provider request; only a turn that actually admits a new NPC may use one additional bounded first-contact completion request before the same guarded commit. Duplicate host completion events share the same logical job; edits, swipes, deletion, branch changes, and chat switches invalidate stale work.")
replace_once('README.md', "- **Auto scan**: one dedicated post-response scanner request.", "- **Auto scan**: one dedicated post-response scan operation; newly admitted NPCs may receive one bounded current-exchange completion request before commit.")

changelog_insert = """## 0.5.32\n\n- Add one bounded first-contact completion request only when the automatic Scan actually admits a new NPC. The request sees the same current exchange, targets only still-unresolved ordinary fields for the newly admitted dossier, and is sanitized before application so it cannot change activity/presence, relationship state or Current Dynamic, lifecycle, family/social graph, identity, or already-populated fields. First pass and completion persist through one owned checkpoint/commit.\n- If the optional completion request fails, preserve the valid admitted first pass and report an explicit partial-coverage diagnostic instead of discarding the dossier. Existing-cast turns remain one provider request; no recurring completeness scan, historical backfill, or provider-specific semantic rule is introduced.\n- Keep deterministic birthday generation and internal provenance bookkeeping, but remove the user/model-facing `generated` label from dossier presentation, compact scanner context, and foreground cache identity. Generated dates behave as ordinary stable stored birthdays in normal continuity. Persisted schema remains version 1.\n\n"""
replace_once('CHANGELOG.md', '## 0.5.31\n', changelog_insert + '## 0.5.31\n')

print('v0.5.32 staged')
