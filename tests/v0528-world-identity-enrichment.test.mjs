import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { applyScanResult } from '../src/scanner.js';
import { createEmptyState } from '../src/schema.js';
import { identityPresencePromptRules, structuredEvidencePromptRules } from '../src/evidence-adapter.js';

const ZERO = { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: 'Routine first contact.' };

function namedPatch({ name = 'Maren Keller', anchor = 'clerk', identityExcerpt, activityExcerpt = identityExcerpt, role = 'Guild intake clerk' } = {}) {
  return {
    id: '', name, identityKind: 'named', role,
    identityEvidence: { anchor, excerpts: [identityExcerpt], explanation: 'The current visible individual is the canonically identified NPC.' },
    activityEvidence: {
      exchangeActive: { excerpts: [activityExcerpt], explanation: 'The NPC acts in the current exchange.' },
      inChat: { excerpts: [activityExcerpt], explanation: 'The NPC remains relevant at scene end.' },
    },
    relationshipChange: structuredClone(ZERO),
    relationshipSummary: 'Professional first-contact intake interaction.',
    relationshipSummaryEvidence: { excerpts: [activityExcerpt], explanation: 'The NPC handles the player intake.' },
  };
}

function payload(patches, refs = patches.map(row => row.name)) {
  return { exchangeActiveNpcIds: refs, inChatNpcIds: refs, worldActiveNpcIds: [], npcs: patches, socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {} };
}

function policy(visible, { present = '', offscreen = '', inner = '', excluded = '' } = {}) {
  return {
    detected: true, visibleText: visible,
    worldStateText: [present, offscreen].filter(Boolean).join('\n'),
    worldPresentText: present, worldOffscreenText: offscreen, worldOtherText: '',
    innerChatterText: inner, excludedText: excluded, excludedTags: [], relationshipSources: [{ id: 'assistant-visible', kind: 'visible', role: 'assistant', text: visible }],
  };
}

function apply(result, visible, evidencePolicy, admissionMode = 'balanced') {
  const state = createEmptyState('chat:v0528-world-identity');
  state.branchSafety = { status: 'safe' };
  return applyScanResult(state, result, {
    sourceMessageId: 2, turn: 1, currentAdmissionText: visible, profileContext: visible, semanticEvidenceContext: visible, relationshipContext: visible,
    evidencePolicy, admissionMode, applyRelationship: false, preservePresence: true, preserveObservation: true,
  });
}

test('visible unique role anchor can enrich to one canonical World_State name without role-word heuristics', () => {
  const visible = 'The clerk came out from behind the counter and steered you toward the reception planking.';
  const patch = namedPatch({ identityExcerpt: visible });
  const result = apply(payload([patch]), visible, policy(visible, { present: 'Maren Keller: Guild Intake Clerk' }));
  const npc = result.state.npcs.find(row => row.name === 'Maren Keller');
  assert.ok(npc);
  assert.equal(result.patchResolutions[0].status, 'accepted');
  assert.deepEqual(result.exchangeActiveNpcIds, [npc.id]);
});

test('structured-only canonical name is never accepted as identityEvidence.anchor', () => {
  const visible = 'The clerk came out from behind the counter.';
  const patch = namedPatch({ anchor: 'Maren Keller', identityExcerpt: visible });
  const result = apply(payload([patch]), visible, policy(visible, { present: 'Maren Keller: Guild Intake Clerk' }));
  assert.equal(result.state.npcs.length, 0);
  assert.equal(result.patchResolutions[0].reason, 'identity-evidence-unresolved');
});

test('visible role anchor cannot invent a proper name without current World_State canonical corroboration', () => {
  const visible = 'The clerk came out from behind the counter.';
  const patch = namedPatch({ identityExcerpt: visible });
  const result = apply(payload([patch]), visible, policy(visible));
  assert.equal(result.state.npcs.length, 0);
  assert.equal(result.patchResolutions[0].reason, 'identity-evidence-unresolved');
});

test('World_State canonical corroboration does not rescue fabricated or anchor-disconnected identity excerpts', () => {
  const visible = 'The clerk came out from behind the counter. A ledger lies beside the wax seal.';
  const fabricated = namedPatch({ identityExcerpt: 'The clerk stamped the ledger.' });
  const disconnected = namedPatch({ identityExcerpt: 'A ledger lies beside the wax seal.' });
  for (const patch of [fabricated, disconnected]) {
    const result = apply(payload([patch]), visible, policy(visible, { present: 'Maren Keller: Guild Intake Clerk' }));
    assert.equal(result.state.npcs.length, 0);
    assert.equal(result.patchResolutions[0].reason, 'identity-evidence-unresolved');
  }
});

test('shared visible role anchors fail closed across competing named proposals', () => {
  const a = 'The clerk in blue opens one ledger.';
  const b = 'The clerk in red opens another ledger.';
  const visible = a + ' ' + b;
  const first = namedPatch({ name: 'Maren Keller', identityExcerpt: a, activityExcerpt: a });
  const second = namedPatch({ name: 'Tessa Vale', identityExcerpt: b, activityExcerpt: b });
  const present = 'Maren Keller: Guild Intake Clerk\nTessa Vale: Guild Intake Clerk';
  const result = apply(payload([first, second]), visible, policy(visible, { present }));
  assert.equal(result.state.npcs.length, 0);
  assert.deepEqual(result.patchResolutions.map(row => row.status), ['unresolved', 'unresolved']);
});

test('unique visible short proper name still enriches to the compatible World_State full name', () => {
  const visible = 'Maren points to the ledger and waits.';
  const patch = namedPatch({ anchor: 'Maren', identityExcerpt: visible });
  const result = apply(payload([patch]), visible, policy(visible, { present: 'Maren Keller: Guild Intake Clerk' }));
  assert.ok(result.state.npcs.some(row => row.name === 'Maren Keller'));
});

test('named-preferred accepts valid named enrichment while manual admission still blocks automatic creation', () => {
  const visible = 'The clerk points to the ledger and waits.';
  const patch = namedPatch({ identityExcerpt: visible });
  const p = policy(visible, { present: 'Maren Keller: Guild Intake Clerk' });
  assert.equal(apply(payload([patch]), visible, p, 'named_preferred').state.npcs.length, 1);
  assert.equal(apply(payload([patch]), visible, p, 'manual').state.npcs.length, 0);
});

test('canonical name in private or excluded structured material cannot enrich a visible anchor', () => {
  const visible = 'The clerk points to the ledger and waits.';
  const patch = namedPatch({ identityExcerpt: visible });
  for (const p of [policy(visible, { inner: 'Maren Keller' }), policy(visible, { excluded: 'Maren Keller' })]) {
    const result = apply(payload([patch]), visible, p);
    assert.equal(result.state.npcs.length, 0);
  }
});

test('identity contract tells the model to keep visible anchor wording during World_State name enrichment', () => {
  const identity = identityPresencePromptRules().join(' ');
  const structured = structuredEvidencePromptRules().join(' ');
  assert.match(identity, /proper\/short name or unique role\/description/);
  assert.match(structured, /keep identityEvidence\.anchor visible/);
  assert.match(structured, /structured-only canonical wording in name/);
});

test('superseded deterministic role-head admission authority is removed', () => {
  const source = fs.readFileSync(new URL('../src/scan-application.js', import.meta.url), 'utf8');
  for (const retired of ['visibleRoleIntroductionForPatch', 'roleIdentityCues', 'WORLD_IDENTITY_GENERIC_ROLE_HEADS', 'WORLD_IDENTITY_INTRO_WORDS', 'worldStateIdentityBridgesVisibleIntroduction']) {
    assert.doesNotMatch(source, new RegExp(retired));
  }
});


test('visible identity anchor may exactly equal the proposed unique role without becoming a canonical-name shortcut', () => {
  const visible = 'The Guild intake clerk points to the ledger and waits.';
  const patch = namedPatch({ anchor: 'Guild intake clerk', role: 'Guild intake clerk', identityExcerpt: visible });
  const result = apply(payload([patch]), visible, policy(visible, { present: 'Maren Keller: Guild Intake Clerk' }));
  const npc = result.state.npcs.find(row => row.name === 'Maren Keller');
  assert.ok(npc);
  assert.equal(result.patchResolutions[0].status, 'accepted');
});
