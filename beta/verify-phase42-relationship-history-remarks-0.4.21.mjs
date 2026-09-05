import assert from 'node:assert/strict';
import { applyScanResult } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import { createEmptyState, normalizeNpc, normalizeState } from '../v03/schema.js';
import { dossierHtml } from '../v03/dossier-view.js';

const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

function axis(excerpts, explanation) {
    return { excerpts: Array.isArray(excerpts) ? excerpts : [excerpts], explanation };
}

function stateWithElspeth(relationship = ZERO) {
    const state = createEmptyState('relationship-history-remarks');
    state.npcs = [normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        aliases: ['Elspeth'],
        present: true,
        relationship: { ...ZERO, ...relationship },
    })];
    return state;
}

function change({ impact = 'ordinary', delta = ZERO, axisEvidence = {}, priority, reason = '', evidence = '' } = {}) {
    return {
        evaluated: true,
        impact,
        delta: { ...ZERO, ...delta },
        axisEvidence,
        ...(priority === undefined ? {} : { priority }),
        reason,
        evidence,
    };
}

function applyElspeth(state, relationshipChange, text, sourceMessageId = 40) {
    const exchange = { user: null, assistant: { mes: text, is_user: false } };
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
        turn: sourceMessageId,
        playerName: 'Lucien',
        relationshipContext: evidencePolicy.relationshipSources.map(source => source.text).join('\n'),
        evidencePolicy,
        applyReturnedNpcPatches: true,
    });
    return result.state.npcs.find(npc => npc.id === 'npc-elspeth');
}

// Empty overall reason: accepted per-axis explanations must survive applyScanResult -> normalizeNpc
// and become the visible remarks for only the axes whose displayed scores changed.
{
    const text = 'Lucien returned the missing ledger exactly as promised. Elspeth smiled and squeezed his hand.';
    const npc = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1 },
        priority: ['trust', 'affection'],
        axisEvidence: {
            trust: axis('Lucien returned the missing ledger exactly as promised.', 'Keeping the promise increased Elspeth’s trust in Lucien.'),
            affection: axis('Elspeth smiled and squeezed his hand.', 'Her warm response increased her affection toward Lucien.'),
        },
        reason: '',
    }), text, 41);
    const history = npc.relationshipHistory.at(-1);
    assert.equal(history.reason, '', 'Empty overall reason was unexpectedly made mandatory');
    assert.equal(history.axisEvidence?.trust?.explanation, 'Keeping the promise increased Elspeth’s trust in Lucien.');
    assert.equal(history.axisEvidence?.affection?.explanation, 'Her warm response increased her affection toward Lucien.');
    const html = dossierHtml(npc);
    assert(html.includes('<b>Trust:</b> Keeping the promise increased Elspeth’s trust in Lucien.'), 'Trust explanation is missing from recent relationship changes');
    assert(html.includes('<b>Affection:</b> Her warm response increased her affection toward Lucien.'), 'Affection explanation is missing from recent relationship changes');
}

// A supplied overall reason remains the preferred concise display remark.
{
    const text = 'Lucien returned the key before leaving.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { trust: 1 },
        axisEvidence: { trust: axis(text, 'Returning the key supported a small trust increase.') },
        reason: 'A concise overall relationship remark.',
    }), text, 42);
    const html = dossierHtml(npc);
    assert(html.includes('A concise overall relationship remark.'), 'Supplied overall reason no longer displays');
    assert(!html.includes('<b>Trust:</b> Returning the key supported a small trust increase.'), 'Per-axis fallback displaced a supplied overall reason');
}

// Accepted explanations survive JSON save/reload plus normalizeState, which is the normal state
// normalization path used around persisted/imported state.
{
    const text = 'Elspeth rested her hand over Lucien’s and thanked him quietly.';
    const npc = applyElspeth(stateWithElspeth(), change({
        delta: { affection: 1 },
        axisEvidence: { affection: axis(text, 'The model judged the gesture as increased affection toward Lucien.') },
    }), text, 43);
    const state = createEmptyState('reload');
    state.npcs = [npc];
    const reloaded = normalizeState(JSON.parse(JSON.stringify(state)), 'reload').npcs[0];
    assert.equal(reloaded.relationshipHistory.at(-1)?.axisEvidence?.affection?.explanation, 'The model judged the gesture as increased affection toward Lucien.', 'History explanation was lost across save/reload normalization');
    assert(dossierHtml(reloaded).includes('<b>Affection:</b> The model judged the gesture as increased affection toward Lucien.'), 'Reloaded history did not render its preserved explanation');
}

// Rejected sibling axes must not be presented as though they changed.
{
    const text = 'Lucien returned the missing ledger exactly as promised.';
    const npc = applyElspeth(stateWithElspeth(), change({
        impact: 'meaningful',
        delta: { trust: 2, affection: 1 },
        priority: ['trust', 'affection'],
        axisEvidence: {
            trust: axis(text, 'The kept promise increased Elspeth’s trust in Lucien.'),
            affection: axis('Elspeth embraced Lucien warmly.', 'This rejected affection proposal must not appear as an applied remark.'),
        },
    }), text, 44);
    assert.equal(npc.relationship.trust, 2);
    assert.equal(npc.relationship.affection, 0);
    const html = dossierHtml(npc);
    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));
    assert(historyHtml.includes('<b>Trust:</b> The kept promise increased Elspeth’s trust in Lucien.'), 'Valid applied-axis explanation disappeared');
    assert(!historyHtml.includes('This rejected affection proposal must not appear as an applied remark.'), 'Rejected axis explanation was displayed as an applied history remark');
    assert(html.includes('This rejected affection proposal must not appear as an applied remark.'), 'Rejected-axis diagnostics were accidentally hidden instead of merely excluded from applied history');
}

// Older entries without persisted axisEvidence may recover from one strongly and unambiguously
// matching evidence-history event. Matching is based on event identity plus changed-axis direction,
// not wording similarity, impact tier alone, or whichever diagnostic happens to be newest.
{
    const npc = normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        relationship: { ...ZERO, trust: 2 },
        relationshipHistory: [{
            impact: 'meaningful',
            delta: { ...ZERO, trust: 2 },
            evidence: 'Lucien kept his promise.',
            reason: '',
            sourceMessageId: 51,
            turn: 51,
            at: 5100,
        }],
        relationshipEvidenceHistory: [{
            impact: 'meaningful',
            delta: { ...ZERO, trust: 2 },
            evidence: 'Lucien kept his promise.',
            reason: '',
            axisEvidence: { trust: axis('Lucien kept his promise.', 'Recovered explanation from the uniquely matching evidence event.') },
            sourceMessageId: 51,
            turn: 51,
            at: 5100,
        }],
    }, { now: 9999 });
    assert(dossierHtml(npc).includes('<b>Trust:</b> Recovered explanation from the uniquely matching evidence event.'), 'Unambiguous historical explanation was not recovered');
}

// Missing evidence and ambiguous equally strong matches use the neutral fallback.
{
    const missing = normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        relationshipHistory: [{ impact: 'ordinary', delta: { ...ZERO, trust: 1 }, reason: '', sourceMessageId: 61, turn: 61, at: 6100 }],
    }, { now: 9999 });
    assert(dossierHtml(missing).includes('No explanation recorded.'), 'Missing historical explanation did not use the neutral fallback');

    const ambiguous = normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        relationshipHistory: [{ impact: 'meaningful', delta: { ...ZERO, trust: 2 }, reason: '', sourceMessageId: 62, turn: 62, at: 6200 }],
        relationshipDiagnostics: [
            {
                impact: 'meaningful', proposed: { ...ZERO, trust: 2 }, capped: { ...ZERO, trust: 2 }, applied: { ...ZERO, trust: 2 },
                axisEvidence: { trust: axis('First source.', 'First competing explanation.') }, sourceMessageId: 62, turn: 62, at: 6201,
            },
            {
                impact: 'meaningful', proposed: { ...ZERO, trust: 2 }, capped: { ...ZERO, trust: 2 }, applied: { ...ZERO, trust: 2 },
                axisEvidence: { trust: axis('Second source.', 'Second competing explanation.') }, sourceMessageId: 62, turn: 62, at: 6202,
            },
        ],
    }, { now: 9999 });
    const html = dossierHtml(ambiguous);
    const historyHtml = html.slice(html.indexOf('Recent relationship changes'), html.indexOf('Relationship evaluation &amp; scoring'));
    assert(historyHtml.includes('No explanation recorded.'), 'Ambiguous historical explanation was guessed instead of left unresolved');
    assert(!historyHtml.includes('First competing explanation.') && !historyHtml.includes('Second competing explanation.'), 'Ambiguous explanation leaked into display history');
    assert(html.includes('First competing explanation.') && html.includes('Second competing explanation.'), 'Ambiguous diagnostic evidence was removed from scoring diagnostics');
}

// All model-authored display text remains escaped, including fallback per-axis explanations.
{
    const hostile = '<img src=x onerror=alert(1)> & "quoted"';
    const npc = normalizeNpc({
        id: 'npc-elspeth',
        name: 'Elspeth Meyer',
        relationshipHistory: [{
            impact: 'ordinary',
            delta: { ...ZERO, trust: 1 },
            reason: '',
            axisEvidence: { trust: axis('Safe excerpt.', hostile) },
            sourceMessageId: 71,
            turn: 71,
            at: 7100,
        }],
    });
    const html = dossierHtml(npc);
    assert(!html.includes('<img src=x onerror=alert(1)>'), 'Model-authored HTML was rendered unsafely');
    assert(html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quoted&quot;'), 'Escaped model-authored explanation is missing');
}

// Persistence/presentation must not alter relationship scoring or fractional progression.
{
    const text = 'Lucien kept the fragile parcel safe and returned it intact.';
    const npc = applyElspeth(stateWithElspeth({ trust: 26 }), change({
        impact: 'meaningful',
        delta: { trust: 2 },
        axisEvidence: { trust: axis(text, 'The model judged the reliable return as increased trust.') },
    }), text, 81);
    assert.equal(npc.relationship.trust, 27, 'Relationship score changed outside the existing progression curve');
    assert.equal(npc.relationshipProgress.trust, 0.6, 'Fractional progression changed outside the existing inertia behavior');
    const reloaded = normalizeNpc(JSON.parse(JSON.stringify(npc)));
    assert.deepEqual(reloaded.relationship, npc.relationship, 'Normalization changed relationship scores while preserving remarks');
    assert.deepEqual(reloaded.relationshipProgress, npc.relationshipProgress, 'Normalization changed fractional progress while preserving remarks');
}

console.log('NPC State 0.4.21 relationship history remarks verified');
