import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const exists = path => fs.existsSync(path);
const manifest = JSON.parse(read('manifest.json'));

if (manifest.version !== '0.4.32') {
    console.log('NPC State v0.4.32 release parity verification skipped on pre-0.4.32 source checkout');
    process.exit(0);
}

const workflow = read('.github/workflows/seed-beta.yml');
const engine = read('v03/engine.js');
const branches = read('v03/branches.js');
const readme = read('README.md');
const changelog = read('CHANGELOG.md');

function sectionBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0 && end > start, 'Missing source section between ' + startMarker + ' and ' + endMarker);
    return source.slice(start, end);
}

assert.equal(manifest.version, '0.4.32', 'Manifest is not v0.4.32');
assert(workflow.includes('name: Build NPC State 0.4.32 Beta'), 'Workflow title is not v0.4.32');
assert(workflow.includes('for patch in $(seq 2 32); do'), 'Cold replay does not include v0.4.32');
assert(workflow.includes("# node beta/bump-0.4.32.mjs ; -name 'phase*-0.4.32.mjs'"), 'Workflow lacks v0.4.32 source marker');

for (const path of [
    'beta/bump-0.4.32.mjs',
    'beta/phase66-operation-context-and-rollback-boundary-0.4.32.mjs',
    'beta/verify-phase66-operation-context-and-rollback-boundary-0.4.32.mjs',
    'beta/verify-phase67-release-source-parity-0.4.32.mjs',
]) assert(exists(path), 'Missing v0.4.32 source-owned file: ' + path);

assert(engine.includes("chatChanged('mutation-after-queue')"), 'Queued mutation chat ownership guard is missing');
assert(engine.includes("chatChanged('mutation-after-load')"), 'Mutation hydration ownership guard is missing');
assert(engine.includes("chatChanged('mutation-before-apply')"), 'Mutation pre-apply ownership guard is missing');
assert(engine.includes("chatChanged('mutation-before-persist')"), 'Mutation pre-persist ownership guard is missing');
assert(engine.includes('const result = await mutator(state, chat);'), 'Mutation helper does not bind origin chat context');
assert(engine.includes("return mutate('update', (state, chat) =>"), 'updateNpc does not use bound mutation context');
assert(engine.includes('sourceMessageId: latestAssistantMessageId(chat)'), 'Manual relationship event metadata can still borrow visible chat context');

const addSection = sectionBetween(engine, '    async function addNpc(name) {', '\n    async function updateNpc(reference, patch = {}, options = {}) {');
const updateSection = sectionBetween(engine, '    async function updateNpc(reference, patch = {}, options = {}) {', '\n    async function fillMissingBirthdays() {');
const archiveSection = sectionBetween(engine, "    async function archiveNpc(reference, archived = true, reason = 'manual') {", '\n    async function resetNpcStaleness(reference) {');
const staleSection = sectionBetween(engine, '    async function resetNpcStaleness(reference) {', '\n    async function deleteNpc(reference) {');
assert(!addSection.includes('const chat = getContext().chat || []'), 'addNpc still reads whichever chat is globally visible');
assert(!archiveSection.includes('const chat = getContext().chat || []'), 'archive/restore still reads whichever chat is globally visible');
assert(!staleSection.includes('const chat = getContext().chat || []'), 'staleness reset still reads whichever chat is globally visible');
assert(!updateSection.includes('latestAssistantMessageId(getContext().chat || [])'), 'updateNpc relationship metadata still reads globally visible chat');
assert(!updateSection.includes('sourceMessageId: latestAssistantMessageId(getContext().chat || [])'), 'updateNpc family reconciliation still reads globally visible chat');

assert(branches.includes('function retainValidRelationshipReplayBoundary(boundary, chat = [])'), 'Rollback replay-boundary retention helper is missing');
assert(branches.includes(': retainValidRelationshipReplayBoundary(source.relationshipReplayBoundary, chat);'), 'Explicit rollback still clears accepted relationship replay protection');

assert(readme.startsWith('# NPC State Beta 0.4.32'), 'README title is not v0.4.32');
assert(readme.includes('## Operation-context ownership and rollback replay continuity'), 'README lacks v0.4.32 documentation');
assert(changelog.includes('## v0.4.32'), 'CHANGELOG lacks v0.4.32 entry');
assert(changelog.includes('queued manual dossier mutations'), 'CHANGELOG lacks mutation ownership fix');
assert(changelog.includes('longest still-valid accepted relationship replay boundary'), 'CHANGELOG lacks preserve-to-rollback replay fix');

console.log('NPC State v0.4.32 release source parity verified');
