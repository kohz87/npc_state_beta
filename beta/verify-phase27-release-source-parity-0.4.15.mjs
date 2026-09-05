import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const ui = read('v03/ui.js');
const scanner = read('v03/scanner.js');
const evidence = read('v03/evidence-adapter.js');
const phase25 = read('beta/phase25-worldstate-identity-bridge-0.4.15.mjs');
const verify25 = read('beta/verify-phase25-worldstate-identity-bridge-0.4.15.mjs');
const verify22 = read('beta/verify-phase22-settings-ui-cleanup-0.4.14.mjs');
const verify24 = read('beta/verify-phase24-release-source-parity-0.4.14.mjs');
const workflow = read('.github/workflows/seed-beta.yml');

const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 15, 'Release source regressed below v0.4.15');
assert(ui.includes(`NPC State <span class="npc-state-version">${manifest.version}</span>`), 'Committed runtime UI version does not match manifest');

assert(scanner.includes('function visibleRoleIntroductionForPatch'), 'Committed scanner lacks visible-role identity matching');
assert(scanner.includes('function worldStateIdentityBridgesVisibleIntroduction'), 'Committed scanner lacks World_State identity bridging');
assert(scanner.includes('function newReferenceAllowedByWorldIdentityBridge'), 'Committed scanner activity references are not bridge-aware');
assert(scanner.includes("if (scope === 'inner' || scope === 'excluded') return false;"), 'Identity bridge no longer fails closed for private/reference-only identities');
assert(scanner.includes("if (scope === 'world') return worldStateIdentityBridgesVisibleIntroduction"), 'World_State identity scope is not routed through the narrow bridge');
assert(evidence.includes('IDENTITY BRIDGE:'), 'Committed evidence policy does not describe the identity bridge');
assert(evidence.includes('World_State without an independent visible introduction still cannot create a dossier'), 'Evidence policy no longer states the World_State-only rejection invariant');

assert(phase25.includes('WORLD_IDENTITY_GENERIC_ROLE_HEADS'), 'v0.4.15 transform source does not contain the identity bridge');
assert(verify25.includes('Visible clerk + matching World_State name failed to create a dossier'), 'Kora-style creation regression is not persisted in source');
assert(verify25.includes('World_State alone incorrectly introduced a new NPC'), 'World_State-only negative regression is not persisted');
assert(verify25.includes('An unrelated visible role incorrectly authorized a World_State identity'), 'Role-mismatch negative regression is not persisted');
assert(verify25.includes('Manual new-NPC admission was weakened'), 'Manual-admission negative regression is not persisted');

// Descendant compatibility must already be committed rather than appearing only after CI mutates fixtures.
assert(verify22.includes('Manifest regressed below v0.4.14'), 'v0.4.14 settings verifier descendant compatibility is not persisted');
assert(verify24.includes('Manifest regressed below v0.4.14'), 'v0.4.14 parity verifier descendant compatibility is not persisted');
assert(verify25.includes('Manifest regressed below v0.4.15'), 'v0.4.15 identity verifier descendant compatibility is not persisted');

assert(/Build NPC State 0\.4\.\d+ Beta/.test(workflow), 'Workflow is not versioned for an NPC State 0.4.x release');
assert(workflow.includes('node beta/bump-0.4.15.mjs'), 'Workflow no longer applies the v0.4.15 bump');
assert(workflow.includes("-name 'phase*-0.4.15.mjs'"), 'Workflow no longer applies v0.4.15 phases');
assert(workflow.includes('worldStateIdentityBridgesVisibleIntroduction'), 'Architecture gate does not guard the identity bridge');
assert(workflow.includes('Generated beta runtime already matches build output.'), 'Workflow lacks source/runtime parity detection');

console.log('NPC State 0.4.15+ release source parity verified');
