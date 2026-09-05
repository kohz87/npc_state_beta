import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInjection } from '../v03/injection.js';
import { applyScanResult, buildScanPrompt } from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import { relationshipMechanicsPrompt } from '../v03/relationship-policy.js';
import { createEmptyState, normalizeNpc, normalizeRelationshipCaps } from '../v03/schema.js';
import {
    RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE,
    RELATIONSHIP_JUDGMENT_EVAL_FIXTURES,
} from './relationship-judgment-eval-fixtures-0.4.23.mjs';

// Deterministic checks below prove prompt plumbing, cap normalization/runtime alignment,
// evidence boundaries, and evaluation-fixture coverage. They do NOT prove live-model judgment quality.
const DEFAULT_CAPS = { ordinary: 1, meaningful: 2, major: 5, extreme: 10 };
const CUSTOM_CAPS = { ordinary: 2, meaningful: 3.5, major: 7, extreme: 12 };
const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

assert.deepEqual(normalizeRelationshipCaps(), DEFAULT_CAPS, 'Relationship cap defaults changed');
assert.deepEqual(
    normalizeRelationshipCaps({ ordinary: '2.5', meaningful: -4, major: 'invalid', extreme: null }),
    { ordinary: 2.5, meaningful: 0, major: 5, extreme: 10 },
    'Relationship cap normalization is not shared-safe for stored settings',
);

const defaultMechanics = relationshipMechanicsPrompt();
assert(defaultMechanics.includes('ordinary: at most 1 raw point on at most 1 supported axis'), 'Default ordinary prompt cap changed');
assert(defaultMechanics.includes('meaningful: at most 2 per supported axis and at most 2 axes'), 'Default meaningful prompt cap changed');
assert(defaultMechanics.includes('major: at most 5 per supported axis and at most 3 axes'), 'Default major prompt cap changed');
assert(defaultMechanics.includes('extreme: at most 10 per supported axis and at most 4 axes'), 'Default extreme prompt cap changed');
assert(defaultMechanics.includes('25/50/75/90') && defaultMechanics.includes('pre-inertia evidence weights'), 'Milestone/inertia guidance changed');

const customMechanics = relationshipMechanicsPrompt(CUSTOM_CAPS);
for (const marker of [
    'ordinary: at most 2 raw points on at most 1 supported axis',
    'meaningful: at most 3.5 per supported axis and at most 2 axes',
    'major: at most 7 per supported axis and at most 3 axes',
    'extreme: at most 12 per supported axis and at most 4 axes',
]) assert(customMechanics.includes(marker), 'Configured relationship cap is missing from shared numeric prompt: ' + marker);
assert(customMechanics.includes('effective configured ceilings, not targets'), 'Configured caps are not framed as ceilings');

const state = createEmptyState('v0423-prompt-alignment');
state.npcs = [normalizeNpc({
    id: 'npc-test', name: 'Test NPC', present: true,
    relationship: { trust: 11, affection: -3, desire: 2, tension: 7 },
    relationshipSummary: 'Existing relationship context only.',
})];

const foreground = buildInjection(state, {
    enabled: true,
    autoScan: true,
    inject: true,
    injectLimit: 4,
    injectBudgetTokens: 2800,
    relationshipCaps: CUSTOM_CAPS,
});
assert(foreground.includes('ordinary: at most 2 raw points on at most 1 supported axis'), 'Foreground prompt does not receive effective ordinary cap');
assert(foreground.includes('meaningful: at most 3.5 per supported axis and at most 2 axes'), 'Foreground prompt does not receive effective meaningful cap');
assert(!foreground.includes('ordinary: at most 1 raw point on at most 1 supported axis'), 'Foreground prompt still advertises stale default caps');
assert(foreground.includes('1-3 short VERBATIM excerpts copied from permitted CURRENT-exchange relationship evidence'), 'Foreground exact current-exchange evidence contract regressed');

const chat = [
    { is_user: true, is_system: false, mes: 'Earlier, Test NPC told the player she was still wary after the already-scored dispute.' },
    { is_user: false, is_system: false, mes: 'Test NPC kept her distance and ended the older exchange guarded.' },
    { is_user: true, is_system: false, mes: 'The player returns today and offers Test NPC the repaired compass.' },
    { is_user: false, is_system: false, mes: 'Test NPC checks the compass, then gives the player a small relieved nod.' },
];
const recovery = buildScanPrompt({
    state,
    chat,
    assistantMessageId: 3,
    scanDepth: 8,
    relationshipCaps: CUSTOM_CAPS,
});
assert(recovery.includes('OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE:'), 'Recovery older-context section is still ambiguously labeled');
assert(!recovery.includes('OLDER CONTEXT FOR PROFILE/MEMORY ONLY:'), 'Contradictory old recovery heading remains');
assert(recovery.includes('prior attitudes, relationship baselines, already-counted developments'), 'Recovery does not explicitly allow older relationship continuity');
assert(recovery.includes('never supplies fresh relationship-event quotations'), 'Older context can be mistaken for fresh relationship evidence');
assert(recovery.includes('CURRENT USER MESSAGE:') && recovery.includes('CURRENT ASSISTANT MESSAGE:'), 'Current exchange boundary disappeared');
assert(recovery.includes('required excerpts remain exact permitted CURRENT-exchange quotations'), 'Recovery exact current-exchange quotation contract regressed');
assert(recovery.includes('ordinary: at most 2 raw points on at most 1 supported axis'), 'Recovery prompt does not receive effective ordinary cap');
assert(recovery.includes('extreme: at most 12 per supported axis and at most 4 axes'), 'Recovery prompt does not receive effective extreme cap');

// The same normalized configured cap used in prompts must clamp runtime proposals.
{
    const scoringState = createEmptyState('v0423-cap-runtime-alignment');
    scoringState.npcs = [normalizeNpc({ id: 'npc-score', name: 'Score NPC', present: true, relationship: ZERO })];
    const evidence = 'Score NPC receives the repaired compass from the player and entrusts the route ledger to them.';
    const exchange = { user: null, assistant: { mes: evidence, is_user: false, is_system: false } };
    const evidencePolicy = buildExchangeEvidencePolicy(exchange);
    const result = applyScanResult(scoringState, {
        exchangeActiveNpcIds: ['npc-score'], inChatNpcIds: ['npc-score'], worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-score', name: 'Score NPC',
            relationshipChange: {
                evaluated: true,
                impact: 'ordinary',
                delta: { ...ZERO, trust: 5 },
                priority: ['trust'],
                axisEvidence: { trust: { excerpts: [evidence], explanation: 'The new entrustment supports a limited increase in reliance.' } },
                evidence: '', reason: '',
            },
        }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 3,
        turn: 1,
        relationshipCaps: CUSTOM_CAPS,
        relationshipContext: evidencePolicy.relationshipSources.map(source => source.text).join('\n'),
        evidencePolicy,
        applyReturnedNpcPatches: true,
    });
    assert.equal(result.state.npcs[0].relationship.trust, 2, 'Runtime did not use the same effective ordinary cap advertised to the model');
}

// Preserve v0.4.17+ numerical mechanics and v0.4.20+ keyword-free evidence validation.
const scannerSource = fs.readFileSync('v03/scanner.js', 'utf8');
const schemaSource = fs.readFileSync('v03/schema.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
assert(scannerSource.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Relationship axis-limit/priority mechanics changed');
assert(scannerSource.includes('if (magnitude <= 25) return 1;') && scannerSource.includes('if (magnitude <= 50) return 0.8;') && scannerSource.includes('if (magnitude <= 75) return 0.6;') && scannerSource.includes('if (magnitude <= 90) return 0.4;'), 'Relationship inertia curve changed');
assert(schemaSource.includes('RELATIONSHIP_MILESTONE_THRESHOLDS') && schemaSource.includes('RELATIONSHIP_MILESTONE_MIN_RAW'), 'Relationship milestone requirements changed');
assert(!scannerSource.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto was introduced');
assert(!scannerSource.includes('relationshipEvidenceGrounding('), 'Runtime semantic relationship veto was introduced');
assert(!scannerSource.includes('relationshipEvidencePolarityConflict('), 'Runtime keyword polarity veto was introduced');
assert(schemaSource.includes('axisEvidence: normalizeRelationshipAxisEvidence(item?.axisEvidence)'), 'v0.4.21 relationship-history evidence persistence regressed');
assert(dossierSource.includes('relationshipHistoryRemarkHtml') && dossierSource.includes('No explanation recorded.'), 'v0.4.21 Recent relationship changes remarks regressed');

const requiredFixtureIds = [
    'desire-increase-clear-indirect',
    'desire-decrease-clear',
    'affection-decrease-clear',
    'desire-material-ambiguity-small-or-zero',
    'unchanged-negative-attitude-zero',
];
for (const id of requiredFixtureIds) assert(RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.some(item => item.id === id), 'Missing v0.4.23 semantic evaluation fixture: ' + id);
for (const fixture of RELATIONSHIP_JUDGMENT_EVAL_FIXTURES) assert(!Object.prototype.hasOwnProperty.call(fixture.acceptance, 'exactDelta'), 'Evaluation fixture incorrectly requires one exact numeric score: ' + fixture.id);
assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.semanticCoverage.includes('Desire increase/decrease'), 'Extended semantic-evaluation coverage is not documented');
const fixtureSource = fs.readFileSync('beta/relationship-judgment-eval-fixtures-0.4.23.mjs', 'utf8');
assert(fixtureSource.includes('NOT deterministic runtime expectations'), 'Evaluation fixtures are not clearly separated from deterministic runtime tests');
assert(!fixtureSource.includes("from '../v03/scanner.js'"), 'Evaluation fixtures became coupled to runtime scoring');

console.log('NPC State 0.4.23 relationship context, configured caps, and semantic evaluation coverage verified');
