import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const schema = read('v03/schema.js');
const dossier = read('v03/dossier-view.js');
const scanner = read('v03/scanner.js');
const phase42 = read('beta/phase42-relationship-history-remarks-0.4.21.mjs');
const phase42b = read('beta/phase42b-legacy-v0420-verifier-compat-0.4.21.mjs');
const verify42 = read('beta/verify-phase42-relationship-history-remarks-0.4.21.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

const manifestPatch = Number(String(manifest.version || '').split('.')[2]);
assert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 21, 'Release source regressed below v0.4.21');
assert(schema.includes('axisEvidence: normalizeRelationshipAxisEvidence(item?.axisEvidence)'), 'relationshipHistory drops per-axis evidence during normalization');
assert(schema.includes('verifiedSources: normalizeRelationshipVerifiedSources(item?.verifiedSources)'), 'relationshipHistory drops verified source metadata during normalization');
assert(schema.includes('axisEvidence: normalizeRelationshipAxisEvidence(input.lastRelationshipChange.axisEvidence)'), 'lastRelationshipChange drops per-axis evidence during normalization');
assert(dossier.includes('function relationshipHistoryRemarkHtml'), 'Relationship history remark renderer is missing');
assert(dossier.includes('function relationshipHistoryRecoveredAxisEvidence'), 'Legacy relationship-history explanation recovery is missing');
assert(dossier.includes('relationshipHistoryIdentityScore'), 'Legacy recovery is not identity-based');
assert(dossier.includes('relationshipHistoryCandidateSupports'), 'Legacy recovery lacks changed-axis corroboration');
assert(dossier.includes('groups.size !== 1'), 'Ambiguous legacy matches are not rejected');
assert(dossier.includes('No explanation recorded.'), 'Neutral missing-explanation fallback is missing');
assert(dossier.includes("escapeHtml(row.explanation)"), 'Model-authored relationship explanations are not escaped');
assert(scanner.includes('const event = { ...evidenceEvent, delta: actualDelta };'), 'Applied relationship history no longer derives from accepted evidence event');
assert(scanner.includes('relationshipAcceptedAxisEvidence(change, allowedAxes)'), 'Accepted-axis evidence filtering disappeared');

assert(phase42.includes('relationshipHistory evidence metadata'), 'v0.4.21 transform source lacks history persistence patch');
assert(phase42.includes('relationshipHistoryRecoveredAxisEvidence'), 'v0.4.21 transform source lacks legacy recovery');
assert(phase42.includes('No explanation recorded.'), 'v0.4.21 transform source lacks neutral fallback');
assert(phase42b.includes('Release source regressed below v0.4.20'), 'v0.4.20 parity compatibility is not source-owned');
assert(verify42.includes('Empty overall reason'), 'Empty-reason display regression is missing');
assert(verify42.includes('Rejected sibling axes'), 'Rejected-axis display regression is missing');
assert(verify42.includes('Ambiguous historical explanation'), 'Ambiguous legacy recovery regression is missing');
assert(verify42.includes('Model-authored HTML was rendered unsafely'), 'HTML escaping regression is missing');
assert(verify42.includes('Fractional progression changed outside'), 'Progression invariance regression is missing');

assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');
assert(workflow.includes('node beta/bump-0.4.21.mjs'), 'Workflow does not apply the v0.4.21 bump');
assert(workflow.includes("-name 'phase*-0.4.21.mjs'"), 'Workflow does not apply v0.4.21 phases');
assert(workflow.includes('relationshipHistoryRemarkHtml'), 'Architecture gate does not guard relationship history remarks');
assert(workflow.includes('relationshipHistoryRecoveredAxisEvidence'), 'Architecture gate does not guard legacy explanation recovery');
assert(workflow.includes('No explanation recorded.'), 'Architecture gate does not guard the neutral fallback');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic source/runtime parity detection');

console.log('NPC State 0.4.21 release source parity verified');
