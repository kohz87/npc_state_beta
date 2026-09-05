import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';

// These are deterministic runtime/provenance tests. The supplied relationship proposals are
// fixtures; they do NOT claim that a model's narrative interpretation has been semantically proven.
const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

function stateWithElspeth(relationship = ZERO) {
    const state = createEmptyState('relationship-evidence-contract');
    state.npcs = [normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        aliases: ['Elspeth'],
        role: 'Guesthouse Owner',
        present: true,
        relationship,
    })];
    return state;
}

function change({ impact = 'ordinary', delta = ZERO, priority, axisEvidence, reason = 'Fixture relationship judgment.', evidence = '' } = {}) {
    return {
        evaluated: true,
        impact,
        delta: { ...ZERO, ...delta },
        ...(priority === undefined ? {} : { priority }),
        ...(axisEvidence === undefined ? {} : { axisEvidence }),
        evidence,
        reason,
    };
}

function axis(excerpts, explanation) {
    return { excerpts: Array.isArray(excerpts) ? excerpts : [excerpts], explanation };
}

function applyElspeth(state, relationshipChange, { user = '', assistant = '', sourceMessageId = 20, turn = sourceMessageId } = {}) {
    const exchange = {
        user: user ? { mes: user, is_user: true } : null,
        assistant: { mes: assistant, is_user: false },
    };
    const evidencePolicy = buildExchangeEvidencePolicy(exchange);
    const result = applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-elspeth'],
        inChatNpcIds: ['npc-elspeth'],
        worldActiveNpcIds: [],
        npcs: [{ id: 'npc-elspeth', name: 'Elspeth Meyer', relationshipChange }],
        socialEdges: [],
        familyFacts: [],
    }, {
        sourceMessageId,
        turn,
        playerName: 'Lucien',
        relationshipContext: evidencePolicy.relationshipSources.map(source => source.text).join('\n'),
        evidencePolicy,
        applyReturnedNpcPatches: true,
    });
    return result.state.npcs.find(npc => npc.id === 'npc-elspeth');
}

// Named emotional support: the runtime verifies the model's exact quote rather than requiring
// a particular emotional keyword pattern.
{
    const text = 'Lucien sat beside Elspeth while she cried. Elspeth let her shoulders ease as he stayed with her.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { tension: -1 },
        axisEvidence: { tension: axis('Elspeth let her shoulders ease as he stayed with her.', 'She became less strained toward Lucien during his support.') },
    }), { assistant: text });
    assert.equal(npc.relationship.tension, -1, 'Named emotional-support evidence was rejected despite exact provenance');
}

// Pronoun-based support must not fail a runtime actor/pronoun semantic heuristic.
{
    const text = 'Elspeth began to cry. You comforted her.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { tension: -1 },
        axisEvidence: { tension: axis('You comforted her.', 'The model judged the comfort as reducing Elspeth’s interpersonal tension toward the player.') },
    }), { assistant: text });
    assert.equal(npc.relationship.tension, -1, 'Pronoun-based exact evidence was rejected');
}

// Naturally described intimacy without the old Desire keywords is provenance-valid. This does
// not assert that every such sentence SHOULD mean Desire; that judgment belongs to the model.
{
    const text = 'Her mouth found yours, tentative at first, then lingering as she drew closer.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { desire: 1 },
        axisEvidence: { desire: axis(text, 'The model judged this as increased intimate attraction toward the player.') },
    }), { assistant: text });
    assert.equal(npc.relationship.desire, 1, 'Natural intimate prose was blocked by runtime semantics');
}

// Multiple axes can carry independent quotations and explanations.
{
    const text = 'Lucien returned the missing ledger exactly as promised. Elspeth smiled and squeezed his hand.';
    const npc = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1 },
        priority: ['trust', 'affection'],
        axisEvidence: {
            trust: axis('Lucien returned the missing ledger exactly as promised.', 'Keeping the promise increased Elspeth’s trust in Lucien.'),
            affection: axis('Elspeth smiled and squeezed his hand.', 'The model judged her affectionate response as increased warmth toward Lucien.'),
        },
    }), { assistant: text });
    assert.equal(npc.relationship.trust, 2);
    assert.equal(npc.relationship.affection, 1);
}

// One fabricated axis must not poison a valid one.
{
    const text = 'Lucien returned the missing ledger exactly as promised.';
    const npc = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1 },
        priority: ['trust', 'affection'],
        axisEvidence: {
            trust: axis(text, 'The model judged the kept promise as stronger trust.'),
            affection: axis('Elspeth embraced Lucien warmly.', 'The model proposed increased affection.'),
        },
    }), { assistant: text });
    assert.equal(npc.relationship.trust, 2, 'Valid axis was discarded with invalid sibling axis');
    assert.equal(npc.relationship.affection, 0, 'Fabricated quotation was accepted');
    assert(npc.relationshipDiagnostics.at(-1)?.axisReasons?.affection?.includes('unverifiable-excerpt'));
    assert(npc.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
}

// Legacy nonzero payloads without the new axisEvidence contract fail closed, while an explicit
// legacy no-change evaluation remains valid and does not break old chats.
{
    const text = 'Lucien returned the missing ledger exactly as promised.';
    const legacyMove = applyElspeth(stateWithElspeth(), {
        evaluated: true,
        impact: 'ordinary',
        delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
        evidence: text,
        reason: 'Legacy global evidence only.',
    }, { assistant: text });
    assert.equal(legacyMove.relationship.trust, 0, 'Legacy global evidence silently authorized movement');
    assert(legacyMove.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('missing-axis-evidence'));

    const legacyZero = applyElspeth(stateWithElspeth(), {
        evaluated: true,
        impact: 'none',
        delta: { ...ZERO },
        evidence: '',
        reason: 'No relationship movement warranted.',
    }, { assistant: 'Elspeth handed Lucien the room key.' });
    assert(legacyZero.relationshipDiagnostics.at(-1)?.reasons?.includes('evaluated-no-change'));
}

// Missing/fabricated/wrong-exchange quotations are provenance failures.
{
    const text = 'Elspeth handed Lucien the room key.';
    const fabricated = applyElspeth(stateWithElspeth(), change({
        delta: { affection: 1 },
        axisEvidence: { affection: axis('Elspeth hugged Lucien.', 'Proposed affection.') },
    }), { assistant: text });
    assert.equal(fabricated.relationship.affection, 0);
    assert(fabricated.relationshipDiagnostics.at(-1)?.axisReasons?.affection?.includes('unverifiable-excerpt'));

    const wrongExchange = applyElspeth(stateWithElspeth(), change({
        delta: { trust: 1 },
        axisEvidence: { trust: axis('Lucien returned her ledger yesterday.', 'Old-event proposal.') },
    }), { assistant: text });
    assert.equal(wrongExchange.relationship.trust, 0);
}

// Formatting normalization may remove markdown wrappers but must preserve negation.
{
    const text = 'Elspeth did **not** pull away.';
    const accepted = applyElspeth(stateWithElspeth(), change({
        delta: { affection: 1 },
        axisEvidence: { affection: axis('Elspeth did not pull away.', 'Fixture interpretation with a formatting-normalized quote.') },
    }), { assistant: text });
    assert.equal(accepted.relationship.affection, 1, 'Conservative formatting normalization failed');

    const negationLost = applyElspeth(stateWithElspeth(), change({
        delta: { affection: 1 },
        axisEvidence: { affection: axis('Elspeth did pull away.', 'Negation was incorrectly dropped.') },
    }), { assistant: text });
    assert.equal(negationLost.relationship.affection, 0, 'Negation was lost during quotation verification');
}

// An excerpt cannot be fabricated by concatenating separate user/assistant sources.
{
    const user = 'Elspeth began to cry.';
    const assistant = 'You comforted her.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { tension: -1 },
        axisEvidence: { tension: axis('Elspeth began to cry. You comforted her.', 'Cross-source concatenation must fail.') },
    }), { user, assistant });
    assert.equal(npc.relationship.tension, 0, 'Quotation verification crossed source boundaries');
}

// World_State remains excluded from relationship-event evidence.
{
    const assistant = '<Blocks><World_State>Lucien comforted Elspeth.</World_State></Blocks>Elspeth remained behind the counter.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { tension: -1 },
        axisEvidence: { tension: axis('Lucien comforted Elspeth.', 'World_State-only quote must not authorize relationship movement.') },
    }), { assistant });
    assert.equal(npc.relationship.tension, 0, 'World_State became unrestricted relationship evidence');
}

// Permitted private relationship context remains quotable for an internal attitude.
{
    const assistant = '<Blocks><NPC_Inner_Chatter>I trust Lucien more after that.</NPC_Inner_Chatter></Blocks>Elspeth quietly closes the ledger.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { trust: 1 },
        axisEvidence: { trust: axis('I trust Lucien more after that.', 'The private relationship thought explicitly changes her trust toward Lucien.') },
    }), { assistant });
    assert.equal(npc.relationship.trust, 1, 'Permitted private relationship context was not retained');
    assert(npc.relationshipDiagnostics.at(-1)?.verifiedSources?.trust?.some(source => source.endsWith(':inner')));
}

// Priority resolves tied overflow without wasting legal slots.
{
    const text = 'Lucien kept his promise. Elspeth squeezed his hand. Elspeth’s rigid posture softened beside him.';
    const evidence = {
        trust: axis('Lucien kept his promise.', 'Fixture trust judgment.'),
        affection: axis('Elspeth squeezed his hand.', 'Fixture affection judgment.'),
        tension: axis('Elspeth’s rigid posture softened beside him.', 'Fixture tension judgment.'),
    };
    const prioritized = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful', delta: { trust: 1, affection: 1, tension: -1 },
        priority: ['tension', 'affection', 'trust'], axisEvidence: evidence,
    }), { assistant: text });
    assert.equal(prioritized.relationship.tension, -1);
    assert.equal(prioritized.relationship.affection, 1);
    assert.equal(prioritized.relationship.trust, 0);
    assert(prioritized.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('axis-limit'));

    const fallback = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful', delta: { trust: 1, affection: 1, tension: -1 }, axisEvidence: evidence,
    }), { assistant: text });
    assert.equal(fallback.relationship.trust, 1, 'Legacy fallback did not fill first tied slot');
    assert.equal(fallback.relationship.affection, 1, 'Legacy fallback did not fill second tied slot');
    assert.equal(fallback.relationship.tension, 0, 'Legacy fallback order changed unexpectedly');
}

// Same-message reapplication is idempotent per axis; a distinct later event is not rejected
// merely because it affects the same axis.
{
    const firstText = 'Lucien returned the missing ledger exactly as promised.';
    const firstChange = change({
        delta: { trust: 1 },
        axisEvidence: { trust: axis(firstText, 'Fixture trust judgment for the first event.') },
    });
    const first = applyElspeth(stateWithElspeth(), firstChange, { assistant: firstText, sourceMessageId: 20, turn: 20 });
    assert.equal(first.relationship.trust, 1);

    const state = stateWithElspeth();
    state.npcs = [first];
    const repeated = applyElspeth(state, firstChange, { assistant: firstText, sourceMessageId: 20, turn: 20 });
    assert.equal(repeated.relationship.trust, 1, 'Same source message applied twice');
    assert(repeated.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('duplicate'));

    const laterState = stateWithElspeth();
    laterState.npcs = [repeated];
    const laterText = 'Two evenings later, Lucien returned Elspeth’s borrowed key before she asked.';
    const later = applyElspeth(laterState, change({
        delta: { trust: 1 },
        axisEvidence: { trust: axis(laterText, 'Fixture trust judgment for a distinct later event.') },
    }), { assistant: laterText, sourceMessageId: 24, turn: 24 });
    assert.equal(later.relationship.trust, 2, 'Distinct later event was incorrectly text-deduplicated');
}

// Existing cap and milestone/progression behavior remains authoritative after provenance.
{
    const text = 'Lucien kept the promise he made to Elspeth.';
    const atGate = applyElspeth(stateWithElspeth({ trust: 25, affection: 0, desire: 0, tension: 0 }), change({
        impact: 'meaningful', delta: { trust: 1 },
        axisEvidence: { trust: axis(text, 'Fixture trust judgment qualifying for the existing 25 gate.') },
    }), { assistant: text });
    assert.equal(atGate.relationship.trust, 26, 'Existing 25-gate progression behavior regressed');

    const capped = applyElspeth(stateWithElspeth(), change({
        impact: 'ordinary', delta: { trust: 9 },
        axisEvidence: { trust: axis(text, 'Fixture trust judgment subject to ordinary cap.') },
    }), { assistant: text });
    assert.equal(capped.relationship.trust, 1, 'Configured impact cap stopped applying');
    assert.equal(capped.relationshipDiagnostics.at(-1)?.proposed?.trust, 9);
    assert.equal(capped.relationshipDiagnostics.at(-1)?.capped?.trust, 1);
    assert(capped.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('cap-clamped'));
}

// Malformed/non-finite movement fails closed per axis.
{
    const text = 'Lucien kept his promise.';
    const nonFinite = applyElspeth(stateWithElspeth(), {
        evaluated: true,
        impact: 'ordinary',
        delta: { trust: 'NaN', affection: 0, desire: 0, tension: 0, loyalty: 2 },
        priority: ['trust', 'loyalty'],
        axisEvidence: { trust: axis(text, 'Fixture trust judgment.') },
        reason: 'Malformed fixture.',
    }, { assistant: text });
    assert.equal(nonFinite.relationship.trust, 0);
    assert(nonFinite.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('non-finite'));
    assert(nonFinite.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('proposal:unknown-axis:')));

    const missingExplanation = applyElspeth(stateWithElspeth(), change({
        delta: { trust: 1 }, axisEvidence: { trust: { excerpts: [text], explanation: '' } },
    }), { assistant: text });
    assert.equal(missingExplanation.relationship.trust, 0);
    assert(missingExplanation.relationshipDiagnostics.at(-1)?.axisReasons?.trust?.includes('missing-explanation'));
}

const relationshipEvidence = fs.readFileSync(new URL('../v03/relationship-evidence.js', import.meta.url), 'utf8');
const evidenceAdapter = fs.readFileSync(new URL('../v03/evidence-adapter.js', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../v03/scanner.js', import.meta.url), 'utf8');
const injection = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
const relationshipPolicy = fs.readFileSync(new URL('../v03/relationship-policy.js', import.meta.url), 'utf8');
const dossier = fs.readFileSync(new URL('../v03/dossier-view.js', import.meta.url), 'utf8');

assert(relationshipEvidence.includes('relationshipEvidenceExcerptMatch'), 'Exact relationship quotation matcher is missing');
assert(evidenceAdapter.includes('relationshipSources'), 'Bounded relationship source list is missing');
assert(scanner.includes('axisEvidenceStatus'), 'Per-axis evidence schema validation is missing');
assert(scanner.includes('relationshipAxisProvenance'), 'Per-axis quotation provenance is missing');
assert(scanner.includes('relationshipEvidenceSources'), 'Scanner does not consume bounded relationship sources');
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Legacy Desire keyword veto remains in runtime');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Legacy lexical/semantic grounding still authorizes runtime movement');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Legacy keyword polarity veto remains in runtime movement');
assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Foreground prompt lacks new relationship evidence contract');
assert(relationshipPolicy.includes('Financial/material relief'), 'Recovery semantic-judgment cautions are missing');
assert(relationshipPolicy.includes('Repeated aftermath'), 'Recovery prompt does not instruct zero for repeated aftermath');
assert(dossier.includes('Verified source:'), 'Diagnostic UI does not expose verified source evidence');

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.version, '0.4.20');

console.log('NPC State 0.4.20 deterministic relationship evidence contract verified');
