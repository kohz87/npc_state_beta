import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const relationshipEvidence = read('v03/relationship-evidence.js');
const evidenceAdapter = read('v03/evidence-adapter.js');
const injection = read('v03/injection.js');
const policy = read('v03/relationship-policy.js');
const dossier = read('v03/dossier-view.js');
const phase39 = read('beta/phase39-relationship-evidence-contract-0.4.20.mjs');
const verify39 = read('beta/verify-phase39-relationship-evidence-contract-0.4.20.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.20', 'Release source is not v0.4.20');
assert(relationshipEvidence.includes('export function relationshipEvidenceExcerptMatch'), 'Exact excerpt matcher missing from runtime');
assert(evidenceAdapter.includes('relationshipSources'), 'Bounded relationship source policy missing from runtime');
assert(scanner.includes('function relationshipAxisProvenance'), 'Per-axis provenance validator missing from runtime');
assert(scanner.includes('axisEvidenceStatus'), 'Per-axis structural validation missing from runtime');
assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Priority-aware axis selection missing from runtime');
assert(scanner.includes('relationshipAxisLooksDuplicate'), 'Per-axis idempotency guard missing from runtime');
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Legacy Desire keyword veto remains in runtime');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Legacy lexical/semantic grounding remains an application veto');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Legacy keyword polarity remains an application veto');
assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Foreground evidence contract missing');
assert(policy.includes('RELATIONSHIP JUDGMENT AND PER-AXIS EVIDENCE'), 'Recovery relationship-judgment contract missing');
assert(dossier.includes('Verified source:'), 'Per-axis diagnostic evidence UI missing');

assert(phase39.includes('relationshipEvidenceExcerptMatch'), 'v0.4.20 transform source lacks exact provenance matcher');
assert(phase39.includes('relationshipSources'), 'v0.4.20 transform source lacks bounded source policy');
assert(phase39.includes('missing-axis-evidence'), 'v0.4.20 transform source lacks legacy fail-closed behavior');
assert(phase39.includes('priority:nonmoving-axis:'), 'v0.4.20 transform source lacks priority validation');
assert(verify39.includes('deterministic runtime/provenance tests'), 'Runtime/LLM semantic-test separation is not documented');
assert(verify39.includes('Pronoun-based support'), 'Pronoun provenance regression is missing');
assert(verify39.includes('Natural intimate prose'), 'Non-keyword intimacy regression is missing');
assert(verify39.includes('World_State became unrestricted relationship evidence'), 'Structured evidence firewall regression is missing');
assert(verify39.includes('Distinct later event was incorrectly text-deduplicated'), 'Distinct-event duplicate regression is missing');

assert(workflow.includes('Build NPC State 0.4.20 Beta'), 'Workflow is not versioned for v0.4.20');
assert(workflow.includes('node beta/bump-0.4.20.mjs'), 'Workflow does not apply the v0.4.20 bump');
assert(workflow.includes("-name 'phase*-0.4.20.mjs'"), 'Workflow does not apply v0.4.20 phases');
assert(workflow.includes('relationshipEvidenceExcerptMatch'), 'Architecture gate does not guard exact relationship provenance');
assert(workflow.includes('relationshipSources'), 'Architecture gate does not guard bounded relationship sources');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic source/runtime parity detection');

console.log('NPC State 0.4.20 release source parity verified');
