import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const evidence = read('v03/evidence-adapter.js');
const injection = read('v03/injection.js');
const engine = read('v03/engine.js');
const changelog = read('CHANGELOG.md');
const readme = read('README.md');
const workflow = read('.github/workflows/seed-beta.yml');
const phase55 = read('beta/phase55-source-agnostic-identity-presence-0.4.27.mjs');
const phase55b = read('beta/phase55b-legacy-identity-bridge-marker-0.4.27.mjs');
const phase55c = read('beta/phase55c-activity-compatibility-0.4.27.mjs');
const phase55d = read('beta/phase55d-relationship-diagnostic-activity-0.4.27.mjs');
const phase55e = read('beta/phase55e-world-active-evidence-0.4.27.mjs');
const verify55 = read('beta/verify-phase55-source-agnostic-identity-presence-0.4.27.mjs');
const verify55e = read('beta/verify-phase55e-world-active-evidence-0.4.27.mjs');

assert.equal(manifest.version, '0.4.27', 'Manifest is not v0.4.27');
assert(workflow.includes('name: Build NPC State 0.4.27 Beta'), 'Workflow title is not v0.4.27');
assert(workflow.includes('for patch in $(seq 2 27); do'), 'Cold replay does not include v0.4.27');
assert(workflow.includes("# node beta/bump-0.4.27.mjs ; -name 'phase*-0.4.27.mjs'"), 'Workflow lacks v0.4.27 source marker');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks zero-diff parity exit');

for (const marker of [
    'identityEvidenceVerified',
    'activityEvidenceVerified',
    'relationshipChangeCurrentEvidenceVerified',
    'hasRawRelationshipProposal',
    'structuredReferenceSections',
    'legacyWorld',
    "filter(id => !presentIds.includes(id))",
]) assert(scanner.includes(marker), 'Generated scanner lacks v0.4.27 marker: ' + marker);

assert(scanner.includes('A visible name alone says only that the NPC was mentioned.'), 'Plain-narrative worldActive name-only rejection is missing');
assert(scanner.includes("activityEvidenceVerified(patch, 'worldActive', visible)"), 'Plain-narrative worldActive quotation validation is missing');
assert(scanner.includes("channel === 'inChat' && sections.offscreen && !sections.present"), 'Explicit Off-Screen final-presence guard is missing');
assert(scanner.includes('identityAnchorUnique'), 'Structured full-name enrichment ambiguity guard is missing');
assert(scanner.includes('visibleRoleIntroductionForPatch'), 'Legacy role-based identity bridge fallback disappeared');
assert(scanner.includes('visibleShortActivityIdentityMention'), 'v0.4.24 short-name presence bridge disappeared');

for (const marker of [
    'splitWorldStatePresenceSections',
    'worldPresentText',
    'worldOffscreenText',
    'worldOtherText',
    'identityPresencePromptRules',
    'IDENTITY BRIDGE:',
    'World_State without an independent visible introduction still cannot create a dossier',
]) assert(evidence.includes(marker), 'Evidence adapter lacks v0.4.27 marker: ' + marker);

for (const marker of ['identityPresencePromptRules', 'identityEvidence', 'activityEvidence']) {
    assert(injection.includes(marker), 'Foreground capture lacks v0.4.27 marker: ' + marker);
    assert(scanner.includes(marker), 'Recovery scanner lacks v0.4.27 marker: ' + marker);
}
assert(injection.includes('Current visible narrative is sufficient by itself.'), 'Foreground guidance still implies structured blocks are required');
assert(scanner.includes('Current visible narrative is sufficient by itself.'), 'Recovery guidance still implies structured blocks are required');

// Source-owned transforms must contain every compatibility layer used to regenerate runtime.
for (const [source, marker] of [
    [phase55, 'source-agnostic identity and presence grounding'],
    [phase55b, 'World_State without an independent visible introduction still cannot create a dossier'],
    [phase55c, 'relationshipChangeCurrentEvidenceVerified'],
    [phase55d, 'hasRawRelationshipProposal'],
    [phase55e, 'A visible name alone says only that the NPC was mentioned.'],
]) assert(source.includes(marker), 'v0.4.27 transform source lacks marker: ' + marker);

// The exact reported class and its important negative boundaries stay executable.
for (const marker of [
    'v0427-plain-clara',
    'v0427-pronoun-existing',
    'v0427-no-invented-surname',
    'v0427-structured-enrichment',
    'v0427-structured-only-twins',
    'v0427-present-not-world',
    'v0427-offscreen-brina',
    'v0427-mutual-exclusive',
    'v0427-ambiguous-anchor',
    'v0427-direct-full-name',
    'v0427-fabricated-activity',
    'v0427-private-only',
    'v0427-brina-regression',
]) assert(verify55.includes(marker), 'v0.4.27 identity/presence regression pack lacks: ' + marker);
assert(verify55e.includes('A mere public name mention authorized worldActive'), 'Plain-prose worldActive negative regression is missing');
assert(verify55e.includes('Verified plain-narrative off-screen activity was rejected'), 'Plain-prose worldActive positive regression is missing');
assert(verify55e.includes('Fabricated worldActive quotation was accepted'), 'Fabricated worldActive regression is missing');

// Existing relationship, history and family semantics remain intact.
for (const marker of [
    'relationshipInertiaFactor',
    'selectRelationshipAxes(delta, axisLimit, priority = [])',
    'relationshipAxisLooksDuplicate',
    'relationshipHistoryRemarkHtml',
    'FAMILY_KINSHIP_GROUPS',
    'reciprocalFamilyRelation',
    'projectFamilySlotMembers',
]) assert(scanner.includes(marker) || read('v03/dossier-view.js').includes(marker), 'Existing invariant disappeared: ' + marker);
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto was reintroduced');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Runtime relationship semantic keyword gate was reintroduced');
assert(!scanner.includes('relationshipEvidencePolarityConflict('), 'Runtime relationship polarity keyword gate was reintroduced');
assert(!engine.includes('identityPresenceReview'), 'An additional mandatory identity/presence LLM call was introduced');

assert(changelog.includes('## v0.4.27'), 'Changelog lacks v0.4.27');
assert(readme.includes('# NPC State Beta 0.4.27'), 'README title is not v0.4.27');
assert(readme.includes('## Source-agnostic identity and presence grounding'), 'README lacks v0.4.27 behavior documentation');

console.log('NPC State 0.4.27 release source parity verified');
