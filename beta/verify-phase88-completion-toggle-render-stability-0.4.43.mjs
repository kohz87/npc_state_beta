import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCompletenessCoordinator } from '../v03/completeness-coordinator.js';

const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const coordinatorSource = fs.readFileSync('v03/completeness-coordinator.js', 'utf8');

assert(coordinatorSource.includes('PHASE88_COMPLETENESS_TOGGLE_GATE'), 'Completeness toggle gate marker missing');
assert(coordinatorSource.includes('const embeddedOnlyDone = new Map()'), 'Disabled completeness must have bounded in-memory dedupe');
assert(coordinatorSource.includes('settingsAtStart.scanAfterEachResponse === true'), 'Completeness opt-in must be snapshotted before embedded processing');
assert(coordinatorSource.includes('settingsNow.scanAfterEachResponse === true'), 'Turning completeness off during embedded processing must suppress the follow-up');
assert(coordinatorSource.includes('rememberEmbeddedOnly(source.identity, disabled)'), 'Disabled path must dedupe without persistent completion bookkeeping');

assert(indexSource.includes('PHASE88_RENDERLESS_COMPLETION_METADATA'), 'Renderless completion metadata marker missing');
const metadataStart = indexSource.indexOf('function persistMessageMetadata(ctx)');
const storeStart = indexSource.indexOf('function storeCompletionMeta(ctx, messageId, value)');
const storeEnd = indexSource.indexOf('function activeEmbeddedMeta(message)', storeStart);
assert(metadataStart >= 0 && storeStart > metadataStart && storeEnd > storeStart, 'Completion metadata helpers must be structurally identifiable');
const metadataBlock = indexSource.slice(metadataStart, storeStart);
const storeBlock = indexSource.slice(storeStart, storeEnd);
assert(metadataBlock.includes('ctx?.saveChat?.()'), 'Metadata-only persistence must save chat state');
assert(!metadataBlock.includes('updateMessageBlock'), 'Metadata-only persistence must not rebuild a message');
assert(storeBlock.includes('persistMessageMetadata(ctx);'), 'Completion records must use renderless persistence');
assert(!storeBlock.includes('persistMessageMutation'), 'Completion records must not use the message-rerender persistence helper');
assert(!storeBlock.includes('updateMessageBlock'), 'Completion records must not directly rebuild the message DOM');
assert(indexSource.includes('function persistMessageMutation(ctx, messageId)'), 'Real message-text mutations still need the ordinary persistence helper');
assert(indexSource.includes('ctx.updateMessageBlock?.(messageId, ctx.chat?.[messageId])'), 'NPC transport removal must retain its intentional one message rerender');

function responseSource(identity = 'chat|7|0|fp') {
    return { valid: true, chatKey: 'chat', messageId: 7, identity, expectedFingerprint: 'fp', expectedSwipeId: 0, message: {} };
}

{
    let embeddedCalls = 0;
    let completenessCalls = 0;
    let writes = 0;
    const statuses = [];
    const coordinator = createCompletenessCoordinator({
        getSource: () => responseSource('disabled'),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: false }),
        runEmbedded: async () => { embeddedCalls += 1; return { ok: true, coverage: 'embedded' }; },
        runCompleteness: async () => { completenessCalls += 1; return { ok: true }; },
        readRecord: () => null,
        writeRecord: () => { writes += 1; },
        setStatus: (_key, status) => statuses.push(status),
    });
    const first = await coordinator.process(7);
    assert.equal(first.completeness, 'disabled');
    assert.equal(embeddedCalls, 1, 'Disabled completeness must still digest the foreground NPC transport exactly once');
    assert.equal(completenessCalls, 0, 'Disabled completeness launched the optional scanner');
    assert.equal(writes, 0, 'Disabled completeness wrote persistent completion metadata and can trigger a second UI mutation');
    assert(!statuses.includes('pending') && !statuses.includes('running'), 'Disabled completeness surfaced follow-up scan activity');

    const duplicate = await coordinator.process(7);
    assert.equal(duplicate.reason, 'completion-already-recorded');
    assert.equal(embeddedCalls, 1, 'Duplicate completion event reran the embedded digest while the optional pass was off');
    assert.equal(completenessCalls, 0);
    assert.equal(writes, 0);
}

{
    let embeddedCalls = 0;
    let completenessCalls = 0;
    let writes = 0;
    const coordinator = createCompletenessCoordinator({
        getSource: () => responseSource('enabled'),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: true }),
        runEmbedded: async () => { embeddedCalls += 1; return { ok: true, coverage: 'embedded' }; },
        runCompleteness: async () => { completenessCalls += 1; return { ok: true, committed: true }; },
        readRecord: () => null,
        writeRecord: () => { writes += 1; },
    });
    const result = await coordinator.process(7);
    assert.equal(result.completeness, 'complete');
    assert.equal(embeddedCalls, 1);
    assert.equal(completenessCalls, 1, 'Enabled completeness did not launch exactly one supplemental request');
    assert.equal(writes, 1, 'Enabled successful completeness should persist one dedupe record');
}

{
    let enabled = true;
    let completenessCalls = 0;
    let writes = 0;
    const coordinator = createCompletenessCoordinator({
        getSource: () => responseSource('turned-off-mid-digest'),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: enabled }),
        runEmbedded: async () => { enabled = false; return { ok: true, coverage: 'embedded' }; },
        runCompleteness: async () => { completenessCalls += 1; return { ok: true }; },
        readRecord: () => null,
        writeRecord: () => { writes += 1; },
    });
    const result = await coordinator.process(7);
    assert.equal(result.completeness, 'disabled');
    assert.equal(completenessCalls, 0, 'Turning the toggle off before the follow-up still launched completeness');
    assert.equal(writes, 0, 'Turned-off completeness wrote a completion record');
}

console.log('PASS v0.4.43 completion toggle and Megumin render stability');
