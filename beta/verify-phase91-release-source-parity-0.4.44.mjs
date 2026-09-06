import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const scannerSource = fs.readFileSync('v03/scanner.js', 'utf8');
const injectionSource = fs.readFileSync('v03/injection.js', 'utf8');

assert.equal(manifest.version, '0.4.44', 'Manifest must be v0.4.44');
assert(workflow.includes('name: Build NPC State 0.4.44 Beta'), 'Workflow title must be v0.4.44');
assert(workflow.includes('for patch in $(seq 2 44); do'), 'Cold replay must include patch 44');
assert(workflow.includes("# node beta/bump-0.4.44.mjs ; -name 'phase*-0.4.44.mjs'"), 'Workflow must retain v0.4.44 source-parity marker');
for (const path of [
    'beta/bump-0.4.44.mjs',
    'beta/phase90-durable-important-memory-merge-0.4.44.mjs',
    'beta/phase90b-legacy-memory-and-v0443-verifier-compat-0.4.44.mjs',
    'beta/verify-phase90-durable-important-memory-merge-0.4.44.mjs',
    'beta/verify-phase91-release-source-parity-0.4.44.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.44 source-owned file: ' + path);

assert(scannerSource.includes('PHASE90_DURABLE_IMPORTANT_MEMORY_MERGE'), 'Durable Important Memories runtime marker missing');
assert(scannerSource.includes('DURABLE IMPORTANT MEMORY MERGE'), 'Recovery/full-scan durable-memory prompt marker missing');
assert(injectionSource.includes('DURABLE IMPORTANT MEMORY MERGE'), 'Foreground durable-memory prompt marker missing');
assert(scannerSource.includes('normalizeMemoryEntries([...(next.memories || []), ...patch.memories]'), 'Runtime must preserve stored memories before applying scan additions');
assert(readme.includes('## Durable Important Memories'), 'README must document v0.4.44 durable memories');
assert(changelog.includes('## v0.4.44\n'), 'CHANGELOG must contain v0.4.44');

const legacyMemory = fs.readFileSync('beta/verify-phase3-memory-hygiene-0.4.3.mjs', 'utf8');
assert(legacyMemory.includes('Existing durable memory was erased by an ordinary scanner patch'), 'Historical memory verifier must enforce durable merge semantics after v0.4.44');
const legacy43 = fs.readFileSync('beta/verify-phase89-release-source-parity-0.4.43.mjs', 'utf8');
assert(legacy43.includes('Manifest must be v0.4.43+'), 'v0.4.43 release verifier must be descendant-compatible after patch 44');
assert(legacy43.includes('Workflow title must be v0.4.43+'), 'v0.4.43 workflow verifier must be descendant-compatible after patch 44');
assert(legacy43.includes('Cold replay must include patch 43 or later'), 'v0.4.43 cold-replay verifier must be descendant-compatible after patch 44');

console.log('PASS v0.4.44 release source parity');
