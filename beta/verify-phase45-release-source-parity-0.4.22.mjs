import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const policy = read('v03/relationship-policy.js');
const injection = read('v03/injection.js');
const scanner = read('v03/scanner.js');
const engine = read('v03/engine.js');
const index = read('v03/index.js');
const ui = read('v03/ui.js');
const schema = read('v03/schema.js');
const dossier = read('v03/dossier-view.js');
const phase44 = read('beta/phase44-relationship-judgment-rubric-0.4.22.mjs');
const phase44a = read('beta/phase44a-legacy-v0421-verifier-compat-0.4.22.mjs');
const verify44 = read('beta/verify-phase44-relationship-judgment-rubric-0.4.22.mjs');
const fixtures = read('beta/relationship-judgment-eval-fixtures-0.4.22.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
assert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 22, 'Release source regressed below v0.4.22');
assert(policy.includes('export function relationshipJudgmentRubricPrompt()'), 'Shared relationship judgment rubric helper is missing');
assert(policy.includes('export function relationshipMechanicsPrompt('), 'Shared relationship numeric contract helper is missing');
assert(policy.includes('export function relationshipCustomCriteriaPrompt'), 'Shared custom-criteria integration helper is missing');
for (const marker of ['NEW CHANGE & CONTINUITY', 'ATTRIBUTION', 'EVIDENCE & INFERENCE', 'AMBIGUITY WITHOUT FREEZING', 'AXIS INDEPENDENCE', 'PROPORTIONALITY', 'MIXED EVIDENCE & CHRONOLOGY', 'BALANCED DIRECTION', 'NO CIRCULAR JUSTIFICATION']) {
    assert(policy.includes(marker), 'Release source lacks relationship rubric marker: ' + marker);
}
assert(injection.includes('relationshipJudgmentRubricPrompt()') && injection.includes('relationshipMechanicsPrompt('), 'Foreground does not use shared relationship guidance');
assert(scanner.includes('relationshipJudgmentRubricPrompt()') && scanner.includes('relationshipMechanicsPrompt('), 'Recovery scanner does not use shared relationship guidance');
assert(injection.includes('relationshipCustomCriteriaPrompt(settings.relationshipCriteria)'), 'Foreground custom criteria are not routed through additive integration');
assert(scanner.includes('relationshipCustomCriteriaPrompt(relationshipCriteria)'), 'Recovery custom criteria are not routed through additive integration');
assert(!engine.includes('relationshipAxisIndependencePrompt()'), 'Recovery engine still appends a duplicate relationship rubric');
assert(index.includes('LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421') && index.includes('relationshipCriteriaText === LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421.trim()'), 'Previous built-in criteria default is not migrated narrowly');
assert(ui.includes('Relationship criteria · additive'), 'Settings UI does not explain additive custom criteria');

// Runtime evidence/scoring architecture remains keyword-free and numerically unchanged.
assert(scanner.includes('function relationshipAxisProvenance'), 'Per-axis provenance validator disappeared');
assert(scanner.includes('relationshipAxisLooksDuplicate'), 'Relationship duplicate protection disappeared');
assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Impact-tier priority/axis selection changed');
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto reappeared');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Runtime semantic rejection gate reappeared');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Runtime keyword polarity veto reappeared');
assert(scanner.includes('if (magnitude <= 25) return 1;') && scanner.includes('if (magnitude <= 50) return 0.8;') && scanner.includes('if (magnitude <= 75) return 0.6;') && scanner.includes('if (magnitude <= 90) return 0.4;'), 'Relationship inertia curve changed');
assert(schema.includes('RELATIONSHIP_MILESTONE_THRESHOLDS') && schema.includes('RELATIONSHIP_MILESTONE_MIN_RAW'), 'Milestone gate mechanics changed');
assert(schema.includes('axisEvidence: normalizeRelationshipAxisEvidence(item?.axisEvidence)'), 'v0.4.21 relationship history persistence regressed');
assert(dossier.includes('relationshipHistoryRemarkHtml') && dossier.includes('relationshipHistoryRecoveredAxisEvidence') && dossier.includes('No explanation recorded.'), 'v0.4.21 history remarks/recovery regressed');

assert(phase44.includes('relationshipJudgmentRubricPrompt'), 'v0.4.22 transform source lacks shared rubric');
assert(phase44.includes('Mere hypothetical alternatives are not vetoes'), 'v0.4.22 transform source lacks ambiguity calibration');
assert(phase44.includes('impact-tier cap is a maximum, not a default target'), 'v0.4.22 transform source lacks proportionality calibration');
assert(phase44.includes('LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421'), 'v0.4.22 transform source lacks narrow default migration');
assert(phase44a.includes('Release source regressed below v0.4.21'), 'v0.4.21 parity compatibility is not source-owned');
assert(verify44.includes('Deterministic tests below verify prompt integration'), 'Runtime/prompt testing is not distinguished from live LLM evaluation');
assert(verify44.includes('Anti-freezing fixture coverage'), 'Anti-freezing deterministic fixture coverage is missing');
assert(fixtures.includes('ambiguous-small-or-zero') && fixtures.includes('clear-move') && fixtures.includes('justified-zero'), 'Evaluation fixtures lack the required calibration classes');
assert(fixtures.includes('Same relationship meaning expressed differently'), 'Keyword-independence paraphrase fixture is missing');

assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');
assert(workflow.includes('node beta/bump-0.4.22.mjs'), 'Workflow does not apply the v0.4.22 bump');
assert(workflow.includes("-name 'phase*-0.4.22.mjs'"), 'Workflow does not apply v0.4.22 phases');
assert(workflow.includes('relationshipJudgmentRubricPrompt'), 'Architecture gate does not guard shared relationship judgment guidance');
assert(workflow.includes('LEGACY_DEFAULT_RELATIONSHIP_CRITERIA_V0421'), 'Architecture gate does not guard narrow custom-criteria migration');
assert(workflow.includes('relationshipHistoryRemarkHtml'), 'Architecture gate no longer guards v0.4.21 history remarks');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic generated-source parity detection');

console.log('NPC State 0.4.22 release source parity verified');
