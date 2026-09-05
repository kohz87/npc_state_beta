import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInjection } from '../v03/injection.js';
import {
    applyScanResult,
    buildScanPrompt,
    buildStructuredDossierImportPrompt,
    buildTargetedRefreshPrompt,
} from '../v03/scanner.js';
import { buildExchangeEvidencePolicy } from '../v03/evidence-adapter.js';
import {
    relationshipCustomCriteriaPrompt,
    relationshipJudgmentRubricPrompt,
    relationshipMechanicsPrompt,
} from '../v03/relationship-policy.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import {
    RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE,
    RELATIONSHIP_JUDGMENT_EVAL_FIXTURES,
} from './relationship-judgment-eval-fixtures-0.4.22.mjs';

// Deterministic tests below verify prompt integration, provenance/mechanics preservation, and
// evaluation-fixture coverage. They do NOT prove that a live LLM will make better semantic judgments.
const CUSTOM = 'CUSTOM-RELATIONSHIP-CALIBRATION: ceremonial oaths are especially significant in this campaign.';
const ZERO = { trust: 0, affection: 0, desire: 0, tension: 0 };

function count(haystack, needle) {
    return String(haystack).split(needle).length - 1;
}

const rubric = relationshipJudgmentRubricPrompt();
for (const marker of [
    'NEW CHANGE & CONTINUITY',
    'ATTRIBUTION',
    'EVIDENCE & INFERENCE',
    'AMBIGUITY WITHOUT FREEZING',
    'AXIS INDEPENDENCE',
    'PROPORTIONALITY',
    'MIXED EVIDENCE & CHRONOLOGY',
    'BALANCED DIRECTION',
    'NO CIRCULAR JUSTIFICATION',
    'PER-AXIS RELATIONSHIP EVIDENCE',
]) assert(rubric.includes(marker), 'Shared relationship rubric is missing: ' + marker);
assert(rubric.includes('Indirect behavior may justify movement'), 'Indirect/contextual relationship meaning was suppressed');
assert(rubric.includes('Mere hypothetical alternatives are not vetoes'), 'Ambiguity guidance became over-cautious');
assert(rubric.includes('impact-tier cap is a maximum, not a default target'), 'Tier caps are not framed as maxima');
assert(rubric.includes('do not manually apply those reductions a second time'), 'Prompt may double-apply runtime progression resistance');
assert(rubric.includes('1-3 short VERBATIM excerpts copied from permitted CURRENT-exchange relationship evidence'), 'Exact current-exchange quotation contract is missing');
assert(rubric.includes('without keyword-gating'), 'Keyword-free model interpretation contract is missing');

const mechanics = relationshipMechanicsPrompt();
assert(mechanics.includes('ordinary: at most 1 raw point on at most 1 supported axis'), 'Ordinary cap/axis limit changed');
assert(mechanics.includes('meaningful: at most 2 per supported axis and at most 2 axes'), 'Meaningful cap/axis limit changed');
assert(mechanics.includes('major: at most 5 per supported axis and at most 3 axes'), 'Major cap/axis limit changed');
assert(mechanics.includes('extreme: at most 10 per supported axis and at most 4 axes'), 'Extreme cap/axis limit changed');
assert(mechanics.includes('25/50/75/90'), 'Milestone checkpoints disappeared from prompt mechanics');
assert(mechanics.includes('pre-inertia evidence weights'), 'Raw-delta/inertia separation is missing');

const customPrompt = relationshipCustomCriteriaPrompt(CUSTOM);
assert(customPrompt.includes(CUSTOM), 'User-authored custom relationship criteria were not preserved verbatim');
assert(customPrompt.includes('ADDITIVE CALIBRATION'), 'Custom criteria are not identified as additive');
assert(customPrompt.includes('do not let them replace the shared judgment rubric'), 'Custom/shared-rubric precedence is unclear');

const state = createEmptyState('prompt-rubric');
state.npcs = [normalizeNpc({
    id: 'npc-test', name: 'Test NPC', present: true,
    relationship: { trust: 12, affection: 3, desire: 0, tension: 5 },
    relationshipSummary: 'Existing generated summary for context only.',
})];
const foreground = buildInjection(state, {
    enabled: true,
    autoScan: true,
    inject: true,
    injectLimit: 4,
    injectBudgetTokens: 2600,
    relationshipCriteria: CUSTOM,
});
assert.equal(count(foreground, 'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:'), 1, 'Foreground duplicated or omitted the shared rubric');
assert(foreground.includes('NEW CHANGE & CONTINUITY') && foreground.includes('NO CIRCULAR JUSTIFICATION'), 'Foreground does not contain the full shared judgment rubric');
assert.equal(count(foreground, CUSTOM), 1, 'Foreground custom criteria were duplicated or omitted');
assert(foreground.includes('PER-AXIS RELATIONSHIP EVIDENCE is governed by the shared rubric above'), 'Foreground lost the per-axis evidence compatibility anchor');
assert(foreground.includes('World_State and reference/control blocks are not unrestricted relationship-event evidence'), 'Foreground structured-evidence boundary changed');

const chat = [
    { is_user: true, is_system: false, mes: 'The player asks Test NPC to reconsider the route.' },
    { is_user: false, is_system: false, mes: 'Test NPC studies the map, then hands the compass back without comment.' },
];
const recovery = buildScanPrompt({
    state,
    chat,
    assistantMessageId: 1,
    relationshipCriteria: CUSTOM,
    scanDepth: 8,
});
assert.equal(count(recovery, 'RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE:'), 1, 'Recovery scanner duplicated or omitted the shared rubric');
assert(recovery.includes('MIXED EVIDENCE & CHRONOLOGY') && recovery.includes('AMBIGUITY WITHOUT FREEZING'), 'Recovery scanner lacks shared calibration guidance');
assert.equal(count(recovery, CUSTOM), 1, 'Recovery custom criteria were duplicated or omitted');
assert(recovery.includes('Older history is context for stable profile/memory and relationship continuity only'), 'Recovery scanner may replay older relationship evidence');

// Non-scoring reconciliation paths remain non-scoring rather than receiving the movement rubric.
const refresh = buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1 });
assert(refresh.includes('Do NOT change relationship scores or propose relationship deltas in a targeted refresh.'), 'Targeted Refresh can accidentally propose relationship movement');
assert(!refresh.includes('NEW CHANGE & CONTINUITY'), 'Targeted Refresh unnecessarily received the movement rubric');
const structuredImport = buildStructuredDossierImportPrompt({ npc: state.npcs[0], blocks: [{ messageId: 1, role: 'ASSISTANT', tag: 'NPC_Update', body: 'Profile reference.' }] });
assert(structuredImport.includes('NEVER create or change Trust/Affection/Desire/Tension, relationshipChange, relationshipSummary, or relationship history'), 'Structured import can accidentally propose relationship movement');
assert(!structuredImport.includes('NEW CHANGE & CONTINUITY'), 'Structured import unnecessarily received the movement rubric');

const indexSource = fs.readFileSync('v03/index.js', 'utf8');
assert(indexSource.includes('LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421'), 'Exact prior built-in relationship criteria cannot migrate cleanly');
assert(indexSource.includes('relationshipCriteriaText === LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421.trim()'), 'Legacy default-only migration is not explicit');
assert(indexSource.includes('Use this field only for optional campaign-specific calibration'), 'New default relationship criteria are not additive');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
assert(uiSource.includes('Relationship criteria · additive'), 'Settings UI does not explain custom criteria interaction');
assert(uiSource.includes('Custom text here adds campaign-specific calibration without replacing those rules.'), 'Settings UI lacks shared-rubric precedence guidance');

// Preserve the v0.4.20 keyword-free runtime evidence boundary and v0.4.21 history remarks.
const scannerSource = fs.readFileSync('v03/scanner.js', 'utf8');
const schemaSource = fs.readFileSync('v03/schema.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
assert(!scannerSource.includes('DESIRE_EVIDENCE_CUES'), 'A runtime Desire keyword veto was reintroduced');
assert(!scannerSource.includes('relationshipEvidenceGrounding('), 'A runtime semantic grounding veto was reintroduced');
assert(!scannerSource.includes('relationshipEvidencePolarityConflict('), 'A runtime keyword polarity veto was reintroduced');
assert(scannerSource.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Priority/axis-limit mechanics changed');
assert(scannerSource.includes('if (magnitude <= 25) return 1;') && scannerSource.includes('if (magnitude <= 50) return 0.8;') && scannerSource.includes('if (magnitude <= 75) return 0.6;') && scannerSource.includes('if (magnitude <= 90) return 0.4;'), 'Relationship inertia curve changed');
assert(schemaSource.includes('RELATIONSHIP_MILESTONE_THRESHOLDS'), 'Milestone mechanics disappeared');
assert(schemaSource.includes('axisEvidence: normalizeRelationshipAxisEvidence(item?.axisEvidence)'), 'v0.4.21 relationship-history evidence persistence regressed');
assert(dossierSource.includes('relationshipHistoryRemarkHtml') && dossierSource.includes('No explanation recorded.'), 'v0.4.21 relationship-history remarks regressed');

// One existing scoring fixture proves this prompt-only release did not alter score/progress application.
{
    const scoringState = createEmptyState('prompt-only-score-invariance');
    scoringState.npcs = [normalizeNpc({ id: 'npc-score', name: 'Score NPC', present: true, relationship: { ...ZERO, trust: 26 } })];
    const text = 'The player returned the sealed packet intact.';
    const exchange = { user: null, assistant: { mes: text, is_user: false } };
    const evidencePolicy = buildExchangeEvidencePolicy(exchange);
    const result = applyScanResult(scoringState, {
        exchangeActiveNpcIds: ['npc-score'], inChatNpcIds: ['npc-score'], worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-score', name: 'Score NPC',
            relationshipChange: {
                evaluated: true, impact: 'meaningful', delta: { ...ZERO, trust: 2 }, priority: ['trust'], reason: '', evidence: '',
                axisEvidence: { trust: { excerpts: [text], explanation: 'The successful return supports a modest increase in reliance.' } },
            },
        }], socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: 1, turn: 1,
        relationshipContext: evidencePolicy.relationshipSources.map(source => source.text).join('\n'),
        evidencePolicy,
        applyReturnedNpcPatches: true,
    });
    const npc = result.state.npcs[0];
    assert.equal(npc.relationship.trust, 27, 'Prompt-quality release changed relationship score application');
    assert.equal(npc.relationshipProgress.trust, 0.6, 'Prompt-quality release changed fractional progression');
}

// Evaluation fixtures intentionally cover movement, zero, and defensible ambiguity without exact-score lock-in.
assert(RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.length >= 14, 'Relationship evaluation fixture set is too narrow');
const classes = new Map();
const categories = new Set();
for (const fixture of RELATIONSHIP_JUDGMENT_EVAL_FIXTURES) {
    classes.set(fixture.acceptance.class, (classes.get(fixture.acceptance.class) || 0) + 1);
    categories.add(fixture.category);
    assert(!Object.prototype.hasOwnProperty.call(fixture.acceptance, 'exactDelta'), 'Fixture demands one exact numeric answer instead of calibrated judgment: ' + fixture.id);
}
for (const required of RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.requiredClasses) assert(classes.has(required), 'Missing evaluation acceptance class: ' + required);
assert((classes.get('clear-move') || 0) >= 7, 'Anti-freezing fixture coverage is too weak');
assert((classes.get('justified-zero') || 0) >= 4, 'Justified-zero fixture coverage is too weak');
assert((classes.get('ambiguous-small-or-zero') || 0) >= 1, 'Ambiguity fixture coverage is missing');
assert(categories.size >= 10, 'Evaluation fixtures do not cover enough distinct judgment dimensions');
const paraphrases = RELATIONSHIP_JUDGMENT_EVAL_FIXTURES.filter(item => item.paraphraseGroup === 'indirect-reliability');
assert.equal(paraphrases.length, 2, 'Keyword-independence paraphrase pair is missing');
assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.antiFreezing.includes('returns zero for nearly all clear-move fixtures fails'), 'Anti-freezing acceptance is not explicit');
assert(RELATIONSHIP_JUDGMENT_EVAL_ACCEPTANCE.antiInflation.includes('tier maxima'), 'Anti-inflation acceptance is not explicit');

// Scenario-specific fixture names must stay out of production prompt logic.
for (const name of ['Mara', 'Rowan', 'Ilyra', 'Tomas', 'Seline', 'Kai', 'Rhea', 'Corin', 'Anwen', 'Jace']) {
    assert(!rubric.includes(name) && !mechanics.includes(name), 'Scenario-specific fixture leaked into production relationship guidance: ' + name);
}

console.log('NPC State 0.4.22 relationship judgment prompt calibration verified');
