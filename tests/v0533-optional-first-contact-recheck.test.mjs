import test from 'node:test';
import assert from 'node:assert/strict';
import { withHost } from './helpers/host-harness.mjs';
import { buildFirstContactCompletionPrompt } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { normalizeSettings } from '../src/settings.js';

const visible = "A young woman in a wool waistcoat grips your sleeve, sets down a ledger, taps one thumbnail, later sweeps drying sand aside, and completes Lucien's provisional G1 registration.";
const assistant = `${visible}\n\n<Blocks><World_State>NPCs Present:\nTessa Morren:\n* G-Rank: N/A (Guild Intake Clerk)\n* Position: Behind the registration counter</World_State><NPC_Inner_Chatter>TESSA: I need this ledger closed by dusk.</NPC_Inner_Chatter></Blocks>`;
const chat = [
  { is_user: true, name: 'Lucien Noctis', mes: 'I enter the guild and approach the young woman receptionist.' },
  { is_user: false, name: 'Narrator', swipe_id: 0, mes: assistant },
];

function firstPayload({ goalEvaluation = null, includeGoal = false } = {}) {
  const insufficient = ['species','background','age','apparentAge','birthday','appearance','appearanceForms','behaviorProfile','speech','mannerisms','mood','currentForm','memories','keyRelationships'];
  if (goalEvaluation === 'insufficient') insufficient.push('goal');
  return {
    exchangeActiveNpcIds: ['Tessa Morren'], inChatNpcIds: ['Tessa Morren'], worldActiveNpcIds: [],
    npcs: [{
      id: '', name: 'Tessa Morren', identityKind: 'named', evaluatedGroups: ['canon','profile','live','memory','npcRelationships'],
      identityEvidence: { anchor: 'young woman in a wool waistcoat', excerpts: [visible], explanation: 'The visible receptionist is Tessa Morren in current World_State.' },
      activityEvidence: { exchangeActive: { excerpts: [visible], explanation: 'She handles Lucien intake.' }, inChat: { excerpts: [visible], explanation: 'She remains at the counter.' } },
      role: 'Guild intake clerk', personality: 'Brisk and efficient during guild intake.', location: 'Adventurer Guild Post', status: 'Handling the station intake backlog.',
      ...(includeGoal ? { goal: 'Close the intake ledger by dusk.' } : {}),
      relationshipChange: { evaluated: true, impact: 'none', delta: { trust:0, affection:0, desire:0, tension:0 }, axisEvidence: {}, reason: 'Initial professional interaction.' },
      relationshipSummary: 'Neutral professional clerk-to-adventurer interaction.',
      relationshipSummaryEvidence: { excerpts: [visible], explanation: 'A role-defined neutral first interaction.' },
      fieldEvaluations: { unchanged: [], insufficient, unavailable: [] },
    }],
    socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
  };
}

function completionPayload(id, { goal = true, evaluateGoal = false, extras = {} } = {}) {
  return {
    exchangeActiveNpcIds: ['wrong'], inChatNpcIds: ['wrong'], worldActiveNpcIds: ['wrong'],
    npcs: [{ id, name: 'Tessa Morren',
      ...(goal ? { semanticUpdates: [{ field: 'goal', operation: 'establish', value: 'Close the intake ledger by dusk.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] }] } : {}),
      ...(evaluateGoal ? { fieldEvaluations: { insufficient: ['goal'] } } : {}),
      ...extras,
    }], socialEdges: [{ from: id, to: 'somebody', relation: 'invented' }], familyFacts: [],
    lifeStateUpdates: [{ id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: 'invented' }], candidateAccounting: {},
  };
}

const latest = h => h.api.operationDiagnostics({ limit: 1 }).at(-1);

test('absent/default first-contact follow-up is Off and admission uses one provider request', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload()); };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 1);
  assert.equal(h.api.settings().firstContactFollowUpMode, 'off');
  assert.equal(latest(h).followUp.status, 'off');
  assert.equal(latest(h).requests.count, 1);
}, { state: createEmptyState('chat:actor.png:fixture') }));

test('follow-up setting is one normalized enum and unknown values fail to Off', () => {
  assert.equal(normalizeSettings({}).firstContactFollowUpMode, 'off');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: 'missing_evaluations' }).firstContactFollowUpMode, 'missing_evaluations');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: 'recheck_unknown_fields' }).firstContactFollowUpMode, 'recheck_unknown_fields');
  assert.equal(normalizeSettings({ firstContactFollowUpMode: true }).firstContactFollowUpMode, 'off');
});

test('Missing evaluations only ignores explicit insufficient while Recheck unknown fields revisits it once', async t => {
  await t.test('missing evaluations mode', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    h.context.generateRaw = async () => { h.metrics.generations += 1; return JSON.stringify(firstPayload({ goalEvaluation: 'insufficient' })); };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 1);
    assert.equal(latest(h).followUp.status, 'unnecessary');
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

  await t.test('recheck unknown mode', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload({ goalEvaluation: 'insufficient' }));
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      return JSON.stringify(completionPayload(id, { goal: false, evaluateGoal: true }));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    assert.equal(latest(h).followUp.status, 'ran');
    const followUp = latest(h).followUp;
    assert.ok(followUp.requestedFields > 1);
    assert.equal(followUp.remainingOutcomes, followUp.requestedFields - 1);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'recheck_unknown_fields' } }));
});

test('existing NPCs never trigger automatic first-contact follow-up', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  const existing = h.persisted().npcs[0];
  h.context.generateRaw = async () => {
    h.metrics.generations += 1;
    const payload = firstPayload({ includeGoal: true });
    payload.npcs[0].id = existing.id;
    payload.candidateAccounting = { [existing.id]: 'evaluated' };
    return JSON.stringify(payload);
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 1);
  assert.equal(latest(h).followUp.status, 'unnecessary');
}, { state: (() => { const s = createEmptyState('chat:actor.png:fixture'); s.npcs.push(normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk' })); return s; })(), settings: { firstContactFollowUpMode: 'recheck_unknown_fields' } }));

test('successful narrow repair clears only repaired warning and preserves protected state', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1; calls += 1;
    if (calls === 1) {
      const payload = firstPayload();
      payload.npcs[0].fieldEvaluations.insufficient = payload.npcs[0].fieldEvaluations.insufficient.filter(field => field !== 'species');
      return JSON.stringify(payload);
    }
    const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
    return JSON.stringify(completionPayload(id, { extras: { personality: 'overwrite', relationshipSummary: 'overwrite' } }));
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  const npc = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
  assert.equal(npc.goal, 'Close the intake ledger by dusk.');
  assert.equal(npc.personality, 'Brisk and efficient during guild intake.');
  assert.equal(npc.relationshipSummary, 'Neutral professional clerk-to-adventurer interaction.');
  assert.deepEqual(npc.relationship, { trust:0, affection:0, desire:0, tension:0 });
  assert.equal(npc.lifeState, 'unknown');
  assert.equal(npc.present, true);
  assert.equal(npc.worldActive, false);
  assert.deepEqual(h.persisted().socialEdges || [], []);
  assert.equal(result.coverageDiagnostics.some(row => row?.missingFields?.includes('goal')), false);
  assert.ok(result.coverageDiagnostics.some(row => row?.missingFields?.includes('species')));
  const d = latest(h);
  assert.equal(d.requests.count, 2);
  assert.equal(d.requests.items[0].purpose, 'automatic-first-pass');
  assert.equal(d.requests.items[1].purpose, 'first-contact-follow-up');
  assert.ok(d.requests.aggregate.chars > d.requests.items[0].input.chars);
  assert.ok(d.requests.aggregate.tokenEstimate > d.requests.items[0].input.tokenEstimate);
  assert.equal(d.requests.aggregate.tokenEstimateKind, 'estimated');
  assert.equal(d.requests.aggregate.billedTokens, 'unavailable');
  assert.equal(d.followUp.acceptedChanges, 1);
  assert.equal(h.metrics.posts, 1);
}, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

test('empty, wrong-id, and omitted-field completion responses stay partial', async t => {
  for (const kind of ['empty', 'wrong-id', 'omitted']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      if (kind === 'empty') return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
      if (kind === 'wrong-id') return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: 'npc-wrong', name: 'Tessa Morren', fieldEvaluations: { insufficient: ['goal'] } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
      return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id, name: 'Tessa Morren', fieldEvaluations: { insufficient: ['species'] } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.ok(result.coverageDiagnostics.some(row => ['missing-npc-patch','incomplete-evaluation'].includes(row.status) && row.coverageKind === 'first-contact-completion'));
    if (kind === 'wrong-id') assert.ok(result.coverageDiagnostics.some(row => row.status === 'identity-rejected' && row.reason === 'wrong-stable-id'));
    assert.equal(h.persisted().npcs[0].goal, '');
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

test('zero-change but fully evaluated requested fields is a valid completion', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1; calls += 1;
    if (calls === 1) return JSON.stringify(firstPayload());
    const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
    const fields = JSON.parse(prompt.match(/"unresolvedFields":(\[[^\]]*\])/)?.[1] || '[]');
    return JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id, name: 'Tessa Morren', fieldEvaluations: { insufficient: fields } }], socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} });
  };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(result.coverageDiagnostics.some(row => row.coverageKind === 'first-contact-completion' && ['missing-npc-patch','incomplete-evaluation'].includes(row.status)), false);
  assert.equal(latest(h).followUp.remainingOutcomes, 0);
}, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

test('shared request budget spends malformed first-pass retry and skips follow-up', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async () => { h.metrics.generations += 1; calls += 1; return calls === 1 ? '{bad json' : JSON.stringify(firstPayload()); };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 2);
  const d = latest(h);
  assert.equal(d.requests.count, 2);
  assert.equal(d.requests.items[1].purpose, 'automatic-first-pass-json-retry');
  assert.equal(d.followUp.status, 'skipped-budget');
}, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

test('malformed follow-up cannot make a third request and preserves first-pass data', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  let calls = 0;
  h.context.generateRaw = async () => { h.metrics.generations += 1; calls += 1; return calls === 1 ? JSON.stringify(firstPayload()) : '{bad completion'; };
  const result = await h.entry.processCompletedAssistantResponse(1);
  assert.equal(result.ok, true);
  assert.equal(h.metrics.generations, 2);
  assert.equal(h.persisted().npcs[0].personality, 'Brisk and efficient during guild intake.');
  assert.ok(result.coverageDiagnostics.some(row => row.status === 'first-contact-completion-failed'));
  assert.equal(latest(h).followUp.status, 'failed');
}, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));

test('edit, swipe, and chat ownership changes during follow-up discard before combined persistence', async t => {
  for (const kind of ['edit','swipe','chat']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      const id = prompt.match(/"id":"([^"]+)","name":"Tessa Morren"/)?.[1];
      if (kind === 'edit') h.context.chat[1].mes += ' edited';
      if (kind === 'swipe') h.context.chat[1].swipe_id = 1;
      if (kind === 'chat') h.context.chatId = 'other-chat';
      return JSON.stringify(completionPayload(id));
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.discarded, true);
    assert.equal(h.persisted().npcs.length, 0);
    assert.equal(h.metrics.posts, 0);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

test('follow-up provider failure after edit, swipe, or chat change discards stale first-pass state', async t => {
  for (const kind of ['edit','swipe','chat']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async () => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      if (kind === 'edit') h.context.chat[1].mes += ' edited-before-failure';
      if (kind === 'swipe') h.context.chat[1].swipe_id = 2;
      if (kind === 'chat') h.context.chatId = 'other-chat-before-failure';
      throw new Error('provider failed after ownership changed');
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'stale-operation');
    assert.equal(h.persisted().npcs.length, 0);
    assert.equal(h.metrics.posts, 0);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

test('manual Recheck missing details is current-exchange-only and isolated from focused state channels', () => withHost(async h => {
  h.context.chat = structuredClone(chat);
  const before = structuredClone(h.persisted().npcs[0]);
  h.context.generateRaw = async ({ prompt }) => {
    h.metrics.generations += 1;
    assert.match(prompt, /MANUAL CURRENT-EXCHANGE MISSING-DETAIL RECHECK/);
    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW/);
    return JSON.stringify(completionPayload(before.id));
  };
  const result = await h.api.recheckMissingDetails(before.id);
  assert.equal(result.ok, true);
  const npc = h.persisted().npcs[0];
  assert.equal(npc.goal, 'Close the intake ledger by dusk.');
  assert.equal(npc.relationshipSummary, before.relationshipSummary);
  assert.deepEqual(npc.relationship, before.relationship);
  assert.equal(npc.present, before.present);
  assert.equal(npc.worldActive, before.worldActive);
  assert.equal(npc.lifeState, before.lifeState);
  assert.deepEqual(h.persisted().socialEdges || [], []);
}, { state: (() => { const s = createEmptyState('chat:actor.png:fixture'); s.npcs.push(normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', personality: 'Brisk and efficient during guild intake.', present: true, worldActive: false, relationshipSummary: 'Neutral professional clerk-to-adventurer interaction.' })); return s; })() }));

test('completion prompt remains exact-id/current-exchange scoped', () => {
  const npc = normalizeNpc({ id: 'npc-tessa', name: 'Tessa Morren' });
  const prompt = buildFirstContactCompletionPrompt({ targets: [{ npc, fields: ['goal','mood'] }], chat, assistantMessageId: 1, playerName: 'Lucien Noctis' });
  assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
  assert.match(prompt, /ONLY the complete CURRENT USER \+ ASSISTANT exchange/);
  assert.match(prompt, /ONLY FIELDS TO RECHECK/);
  assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW/);
});
