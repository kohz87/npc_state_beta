import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const scannerSource = fs.readFileSync('v03/scanner.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');

assert(/^0\.4\.(?:4[2-9]|[5-9]\d|\d{3,})$/.test(manifest.version), 'Manifest must be v0.4.42+');
assert(/name: Build NPC State 0\.4\.(?:4[2-9]|[5-9]\d|\d{3,}) Beta/.test(workflow), 'Workflow title must be v0.4.42+');
assert(/for patch in \$\(seq 2 (?:4[2-9]|[5-9]\d|\d{3,})\); do/.test(workflow), 'Cold replay must include patch 42 or later');
assert(workflow.includes("# node beta/bump-0.4.42.mjs ; -name 'phase*-0.4.42.mjs'"), 'Workflow must retain v0.4.42 source-parity marker');
for (const path of [
    'beta/bump-0.4.42.mjs',
    'beta/phase86a-supplemental-scanner-0.4.42.mjs',
    'beta/phase86b-engine-routing-completeness-0.4.42.mjs',
    'beta/phase86c-index-routing-scheduler-0.4.42.mjs',
    'beta/phase86d-scanning-ui-0.4.42.mjs',
    'beta/phase86e-legacy-v0441-release-verifier-compat-0.4.42.mjs',
    'beta/verify-phase86a-scan-profile-routing-0.4.42.mjs',
    'beta/verify-phase86b-completeness-coordinator-0.4.42.mjs',
    'beta/verify-phase86c-completeness-engine-safety-0.4.42.mjs',
    'beta/verify-phase87-release-source-parity-0.4.42.mjs',
    'beta/source-v0.4.42-scan-connection.js.txt',
    'beta/source-v0.4.42-completeness-coordinator.js.txt',
    'v03/scan-connection.js',
    'v03/completeness-coordinator.js',
]) assert(fs.existsSync(path), 'Missing v0.4.42 source-owned file: ' + path);

assert(indexSource.includes("scanConnectionProfileId: ''"), 'Current connection must remain the default');
assert(indexSource.includes('scanAfterEachResponse: false'), 'Completeness must remain opt-in');
assert(indexSource.includes('processCompletedAssistantResponse(messageId)'), 'Completed response coordinator missing');
assert(engineSource.includes('async function completenessScan'), 'Completeness engine path missing');
assert(engineSource.includes('resolveGenerationRoute'), 'Separate scan generation route resolver missing');
assert(scannerSource.includes('POST-RESPONSE DOSSIER COMPLETENESS PASS'), 'Completeness scanner prompt missing');
assert(uiSource.includes('NPC scan connection profile'), 'Profile UI missing');
assert(uiSource.includes('Scan after each response'), 'Completeness UI missing');
assert(readme.includes('## Separate scan connection and completeness pass'), 'README must document v0.4.42');
assert(changelog.includes('## v0.4.42\n'), 'CHANGELOG must contain v0.4.42');

const legacy41 = fs.readFileSync('beta/verify-phase85-release-source-parity-0.4.41.mjs', 'utf8');
assert(legacy41.includes('Manifest must be v0.4.41+'), 'v0.4.41 release verifier must remain descendant-compatible after patch 42');
assert(legacy41.includes('Workflow title must be v0.4.41+'), 'v0.4.41 workflow verifier must remain descendant-compatible after patch 42');
assert(legacy41.includes('Cold replay must include patch 41 or later'), 'v0.4.41 cold-replay verifier must remain descendant-compatible after patch 42');

console.log('PASS v0.4.42 release source parity');
