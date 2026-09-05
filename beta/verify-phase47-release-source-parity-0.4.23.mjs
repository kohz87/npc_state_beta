import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const policy = read('v03/relationship-policy.js');
const injection = read('v03/injection.js');
const scanner = read('v03/scanner.js');
const engine = read('v03/engine.js');
const index = read('v03/index.js');
const schema = read('v03/schema.js');
const dossier = read('v03/dossier-view.js');
const phase46 = read('beta/phase46-context-caps-eval-0.4.23.mjs');
const phase46a = read('beta/phase46a-legacy-v0422-verifier-compat-0.4.23.mjs');
const verify46 = read('beta/verify-phase46-context-caps-eval-0.4.23.mjs');
const fixtures = read('beta/relationship-judgment-eval-fixtures-0.4.23.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
assert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 23, 'Release source regressed below v0.4.23');
assert(schema.includes('export function normalizeRelationshipCaps'), 'Shared relationship-cap normalizer is missing');
assert(policy.includes('export function relationshipMechanicsPrompt(caps = DEFAULT_RELATIONSHIP_CAPS)'), 'Relationship numeric prompt is not settings-aware');
assert(policy.includes('const effectiveCaps = normalizeRelationshipCaps(caps)'), 'Relationship numeric prompt does not share runtime cap normalization');
assert(injection.includes('relationshipMechanicsPrompt(settings.relationshipCaps)'), 'Foreground prompt does not receive effective relationship caps');
assert(scanner.includes('relationshipCaps = DEFAULT_RELATIONSHIP_CAPS'), 'Recovery prompt lacks relationship-cap input/default');
assert(scanner.includes('relationshipMechanicsPrompt(relationshipCaps)'), 'Recovery prompt does not receive effective relationship caps');
assert(engine.includes('relationshipCaps: settings.relationshipCaps'), 'Recovery engine does not pass effective relationship caps into prompt construction');
assert(index.includes('settings.relationshipCaps = normalizeRelationshipCaps(settings.relationshipCaps);'), 'Stored settings do not use the shared relationship-cap normalizer');
assert(scanner.includes('const effectiveCaps = normalizeRelationshipCaps(caps);'), 'Runtime score clamping does not use the shared relationship-cap normalizer');

assert(scanner.includes('OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE:'), 'Recovery older-context heading is not continuity-only');
assert(!scanner.includes('OLDER CONTEXT FOR PROFILE/MEMORY ONLY:'), 'Contradictory older-context heading remains');
assert(scanner.includes('prior attitudes, relationship baselines, already-counted developments'), 'Recovery older context does not explicitly establish relationship continuity');
assert(scanner.includes('never supplies fresh relationship-event quotations'), 'Recovery older context can be mistaken for fresh event evidence');
assert(scanner.includes('required excerpts remain exact permitted CURRENT-exchange quotations'), 'Exact current-exchange evidence contract regressed');

// Keep the judgment layer general and runtime interpretation keyword-free.
assert(policy.includes('Indirect behavior may justify movement'), 'Indirect relationship interpretation guidance disappeared');
assert(policy.includes('AMBIGUITY WITHOUT FREEZING'), 'Relationship ambiguity calibration disappeared');
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto reappeared');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Runtime semantic relationship veto reappeared');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Runtime keyword polarity veto reappeared');

// Preserve all numerical mechanics outside cap-source alignment.
assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Impact-tier axis selection changed');
assert(scanner.includes('if (magnitude <= 25) return 1;') && scanner.includes('if (magnitude <= 50) return 0.8;') && scanner.includes('if (magnitude <= 75) return 0.6;') && scanner.includes('if (magnitude <= 90) return 0.4;'), 'Relationship inertia curve changed');
assert(schema.includes('RELATIONSHIP_MILESTONE_THRESHOLDS') && schema.includes('RELATIONSHIP_MILESTONE_REQUIREMENTS') && schema.includes('RELATIONSHIP_MILESTONE_MIN_RAW'), 'Milestone gate mechanics changed');
assert(scanner.includes('relationshipAxisLooksDuplicate'), 'Relationship duplicate protection disappeared');
assert(scanner.includes('normalizeRelationshipProgress'), 'Fractional relationship progress support disappeared');

// Preserve v0.4.21 Recent relationship changes explanation persistence.
assert(schema.includes('axisEvidence: normalizeRelationshipAxisEvidence(item?.axisEvidence)'), 'Relationship history per-axis evidence persistence regressed');
assert(dossier.includes('relationshipHistoryRemarkHtml') && dossier.includes('relationshipHistoryRecoveredAxisEvidence') && dossier.includes('No explanation recorded.'), 'Recent relationship changes remarks/recovery regressed');

for (const id of [
    'desire-increase-clear-indirect',
    'desire-decrease-clear',
    'affection-decrease-clear',
    'desire-material-ambiguity-small-or-zero',
    'unchanged-negative-attitude-zero',
]) assert(fixtures.includes(id), 'v0.4.23 evaluation pack lacks fixture: ' + id);
assert(fixtures.includes('NOT deterministic runtime expectations'), 'Offline evaluation boundary is not explicit');
assert(verify46.includes('do NOT prove live-model judgment quality'), 'Deterministic/live-model distinction is missing');

assert(phase46.includes('normalizeRelationshipCaps'), 'v0.4.23 transform source lacks shared cap normalization');
assert(phase46.includes('OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE'), 'v0.4.23 transform source lacks recovery context correction');
assert(phase46a.includes('Release source regressed below v0.4.22'), 'v0.4.22 parity compatibility is not source-owned');

assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');
assert(workflow.includes('node beta/bump-0.4.23.mjs'), 'Workflow does not apply the v0.4.23 bump');
assert(workflow.includes("-name 'phase*-0.4.23.mjs'"), 'Workflow does not apply v0.4.23 phases');
assert(workflow.includes('normalizeRelationshipCaps'), 'Architecture gate does not guard shared cap normalization');
assert(workflow.includes('OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE'), 'Architecture gate does not guard the corrected recovery heading');
assert(workflow.includes('relationshipHistoryRemarkHtml'), 'Architecture gate no longer guards v0.4.21 history remarks');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic generated-source parity detection');

console.log('NPC State 0.4.23+ release source parity verified');
