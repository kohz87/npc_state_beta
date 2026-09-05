import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const schema = read('v03/schema.js');
const injection = read('v03/injection.js');
const phase50 = read('beta/phase50-named-family-key-relationships-0.4.25.mjs');
const verify50 = read('beta/verify-phase50-named-family-key-relationships-0.4.25.mjs');
const legacyFamilyVerifier = read('beta/verify-phase4-family-graph-and-key-merge-0.4.2.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.25', 'Release source is not v0.4.25');
assert(schema.includes('memberNames'), 'Family slot named-member persistence missing');
assert(scanner.includes('groundedFamilyMemberNames'), 'Named-family evidence grounding helper missing');
assert(scanner.includes('familyMemberNpc'), 'Named-family safe dossier resolver missing');
assert(scanner.includes('familyCounterpartMatches'), 'Named-family counterpart identity matcher missing');
assert(scanner.includes('projectFamilySlotMembers'), 'Named-family keyRelationship projection missing');
assert(scanner.includes("members: ['explicitly named members from visible evidence; [] when unnamed']"), 'Recovery familyFacts members contract missing');
assert(scanner.includes("addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''), playerName)"), 'Named-family evidence/player plumbing missing');
assert(injection.includes('COUNTABLE FAMILY FACTS'), 'Foreground familyFacts contract was not upgraded');
assert(injection.includes('members MUST list each family member whose personal name is explicitly established in the current visible exchange'), 'Foreground explicit family-name rule missing');
assert(injection.includes('MUST NOT create NPC dossiers by themselves'), 'Named-family admission isolation missing');
assert(injection.includes('Never source member names only from World_State, NPC_Inner_Chatter, control blocks, or older continuity'), 'Named-family structured evidence firewall missing');

for (const marker of [
    'greta-named-twins',
    'greta-named-twins-repeat',
    'greta-partial-name',
    'greta-unnamed-twins',
    'greta-manual-lock',
    'greta-existing-daughters',
    'greta-ambiguous-lyra',
    'greta-structured-names-only',
    'greta-player-family',
    'greta-bundle-members',
]) assert(verify50.includes(marker), 'Named-family regression pack lacks scenario: ' + marker);
assert(verify50.includes("members: ['Lyra', 'Talia']"), 'Exact Lyra/Talia twin-daughter reproduction is missing');
assert(verify50.includes("'Lyra - daughter'"), 'Greta owner relationship projection assertion is missing');
assert(verify50.includes("'Talia - daughter'"), 'Greta second twin relationship projection assertion is missing');

// The new fix must preserve the previous short-name presence repair and the family-slot
// architecture that predates named member projection.
assert(scanner.includes('visibleShortActivityIdentityMention'), 'v0.4.24 short-name presence recovery regressed');
assert(scanner.includes('shortActivityIdentityUnique'), 'v0.4.24 short-name ambiguity guard regressed');
assert(scanner.includes('normalizeFamilySlots'), 'Existing family slot reconciliation disappeared');
assert(scanner.includes("const relation = isTwin ? 'twin sibling' : 'sibling';"), 'Existing sibling/twin inference disappeared');
assert(legacyFamilyVerifier.includes("injection.includes('COUNTABLE UNNAMED FAMILY') || injection.includes('COUNTABLE FAMILY FACTS')"), 'Historical family verifier is not descendant-compatible with named family facts');

assert(phase50.includes('memberNames'), 'v0.4.25 transform source does not persist named family members');
assert(phase50.includes('projectFamilySlotMembers'), 'v0.4.25 transform source lacks owner relationship projection');
assert(phase50.includes('profileContext'), 'v0.4.25 transform source lacks public evidence boundary plumbing');
assert(phase50.includes("keyRelationshipReferencesPlayer(member, playerName)"), 'v0.4.25 transform does not isolate player relationships');

assert(workflow.includes('Build NPC State 0.4.25 Beta'), 'Workflow is not versioned for v0.4.25');
assert(workflow.includes('for patch in $(seq 2 25); do'), 'Workflow does not cold-replay through v0.4.25');
assert(workflow.includes('# node beta/bump-0.4.25.mjs'), 'Workflow lacks v0.4.25 source marker');
assert(workflow.includes("-name 'phase*-0.4.25.mjs'"), 'Workflow does not apply v0.4.25 phases');
assert(workflow.includes('groundedFamilyMemberNames'), 'Architecture gate does not guard named-family evidence grounding');
assert(workflow.includes('projectFamilySlotMembers'), 'Architecture gate does not guard named-family projection');
assert(workflow.includes('memberNames'), 'Architecture gate does not guard named-family persistence');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic generated-source parity detection');

console.log('NPC State 0.4.25 release source parity verified');