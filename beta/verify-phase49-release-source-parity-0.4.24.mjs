import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const evidence = read('v03/evidence-adapter.js');
const relationshipPolicy = read('v03/relationship-policy.js');
const schema = read('v03/schema.js');
const phase48 = read('beta/phase48-presence-short-name-grounding-0.4.24.mjs');
const verify48 = read('beta/verify-phase48-presence-short-name-grounding-0.4.24.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

assert.equal(manifest.version, '0.4.24', 'Release source is not v0.4.24');
assert(scanner.includes('visibleShortActivityIdentityMention'), 'Short-name activity recovery helper is missing');
assert(scanner.includes('shortActivityIdentityScope'), 'Structured short-name scope classifier is missing');
assert(scanner.includes('shortActivityIdentityUnique'), 'Short-name uniqueness guard is missing');
assert(scanner.includes('ACTIVITY_SHORT_IDENTITY_STOP'), 'Short-name generic/title stop set is missing');
assert(scanner.includes("const shortScope = npc ? shortActivityIdentityScope(state, npc, policy) : '';"), 'Activity firewall does not classify short-name evidence scope');
assert(scanner.includes("if (exactScope === 'visible' || shortScope === 'visible') return true;"), 'Visible short-name activity recovery is not authoritative');
assert(scanner.includes("const scope = exactScope === 'unmentioned' && shortScope ? shortScope : exactScope;"), 'Structured-only short names can bypass the activity firewall');
assert(scanner.includes("if (!['world', 'inner', 'excluded'].includes(scope)) return true;"), 'Structured activity scope gate changed unexpectedly');
assert(scanner.includes('return npc?.present === true;'), 'Existing safe presence fallback disappeared');

assert(evidence.includes('World_State') && evidence.includes('by itself NEVER proves exchange action, In chat participation'), 'World_State in-chat firewall regressed');
assert(evidence.includes('NPC_Inner_Chatter') && evidence.includes('by itself NEVER proves In chat presence'), 'Inner-chatter in-chat firewall regressed');
assert(evidence.includes("if (containsReference(policy.visibleText, variants)) return 'visible';"), 'Visible evidence scope ordering changed unexpectedly');
assert(evidence.includes("if (containsReference(policy.worldStateText, variants)) return 'world';"), 'World evidence scope ordering changed unexpectedly');

for (const marker of [
    'brina-short-name',
    'brina-short-name-uppercase',
    'brina-world-only',
    'brina-inner-only',
    'brina-ambiguous-short-name',
    'single-name-control',
]) assert(verify48.includes(marker), 'Presence regression pack lacks scenario: ' + marker);
assert(verify48.includes("name: 'Brina Cole'"), 'Exact reported Brina Cole reproduction is missing');
assert(verify48.includes("name: 'Brina Vane'"), 'Shared-first-name ambiguity guard is missing');

// v0.4.23 relationship alignment and all deterministic scoring mechanics must remain intact.
assert(schema.includes('export function normalizeRelationshipCaps'), 'Shared relationship-cap normalization regressed');
assert(relationshipPolicy.includes('relationshipMechanicsPrompt(caps = DEFAULT_RELATIONSHIP_CAPS)'), 'Settings-aware relationship prompt regressed');
assert(scanner.includes('relationshipMechanicsPrompt(relationshipCaps)'), 'Recovery relationship cap plumbing regressed');
assert(scanner.includes('OLDER CONTEXT — CONTINUITY ONLY; NOT NEW EVENT EVIDENCE:'), 'Older-context continuity boundary regressed');
assert(scanner.includes('selectRelationshipAxes(delta, axisLimit, priority = [])'), 'Relationship axis-limit mechanics changed');
assert(scanner.includes('if (magnitude <= 25) return 1;') && scanner.includes('if (magnitude <= 50) return 0.8;') && scanner.includes('if (magnitude <= 75) return 0.6;') && scanner.includes('if (magnitude <= 90) return 0.4;'), 'Relationship inertia curve changed');
assert(!scanner.includes('DESIRE_EVIDENCE_CUES'), 'Runtime Desire keyword veto reappeared');

assert(phase48.includes('shortActivityIdentityCandidates'), 'v0.4.24 transform source lacks short-name candidate logic');
assert(phase48.includes('shortActivityIdentityUnique'), 'v0.4.24 transform source lacks ambiguity guard');
assert(phase48.includes('shortActivityIdentityScope'), 'v0.4.24 transform source lacks structured short-name scope classification');
assert(phase48.includes('policy?.visibleText') && phase48.includes('policy?.worldStateText') && phase48.includes('policy?.innerChatterText'), 'v0.4.24 transform does not preserve structured evidence boundaries');

assert(workflow.includes('Build NPC State 0.4.24 Beta'), 'Workflow is not versioned for v0.4.24');
assert(workflow.includes('node beta/bump-0.4.24.mjs'), 'Workflow does not apply the v0.4.24 bump');
assert(workflow.includes("-name 'phase*-0.4.24.mjs'"), 'Workflow does not apply v0.4.24 phases');
assert(workflow.includes('visibleShortActivityIdentityMention'), 'Architecture gate does not guard presence recovery');
assert(workflow.includes('shortActivityIdentityUnique'), 'Architecture gate does not guard short-name ambiguity protection');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks deterministic generated-source parity detection');

console.log('NPC State 0.4.24 release source parity verified');
