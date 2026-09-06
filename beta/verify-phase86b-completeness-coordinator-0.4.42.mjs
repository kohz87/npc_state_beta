import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCompletenessCoordinator } from '../v03/completeness-coordinator.js';

const indexSource = fs.readFileSync('v03/index.js', 'utf8');
assert(indexSource.includes('processCompletedAssistantResponse(messageId)'), 'MESSAGE_RECEIVED must use the completed-response coordinator');
assert(indexSource.includes("coverage: 'full-recovery'"), 'Successful full recovery must carry an explicit coverage contract');
assert(indexSource.includes('npc_state_beta_completion_v1'), 'Completion dedupe metadata missing');
assert(indexSource.includes('completedResponseIdentity'), 'Response identity helper missing');

function source(identity = 'chat|1|0|fp') {
    return { valid: true, chatKey: 'chat', messageId: 1, identity, expectedFingerprint: 'fp', expectedSwipeId: 0, message: {} };
}

{
    let embeddedCalls = 0;
    let completenessCalls = 0;
    let record = null;
    const coordinator = createCompletenessCoordinator({
        getSource: () => source(),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: false }),
        runEmbedded: async () => { embeddedCalls += 1; return { ok: true, coverage: 'embedded' }; },
        runCompleteness: async () => { completenessCalls += 1; return { ok: true }; },
        readRecord: () => record,
        writeRecord: (_source, value) => { record = value; },
    });
    const first = await coordinator.process(1);
    assert.equal(first.completeness, 'disabled');
    assert.equal(embeddedCalls, 1);
    assert.equal(completenessCalls, 0);
    const duplicate = await coordinator.process(1);
    assert.equal(duplicate.reason, 'completion-already-recorded');
    assert.equal(embeddedCalls, 1, 'Duplicate completion event reran embedded processing');
    assert.equal(completenessCalls, 0);
}

{
    let embeddedCalls = 0;
    let completenessCalls = 0;
    let releaseEmbedded;
    let record = null;
    const statuses = [];
    const coordinator = createCompletenessCoordinator({
        getSource: () => source('concurrent'),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: true }),
        runEmbedded: async () => { embeddedCalls += 1; await new Promise(resolve => { releaseEmbedded = resolve; }); return { ok: true, coverage: 'embedded' }; },
        runCompleteness: async () => { completenessCalls += 1; return { ok: true, kind: 'completeness' }; },
        readRecord: () => record,
        writeRecord: (_source, value) => { record = value; },
        setStatus: (_key, status) => statuses.push(status),
    });
    const first = coordinator.process(1);
    const second = coordinator.process(1);
    await Promise.resolve();
    releaseEmbedded();
    const [a, b] = await Promise.all([first, second]);
    assert.equal(a.completeness, 'complete');
    assert.equal(b.completeness, 'complete');
    assert.equal(embeddedCalls, 1);
    assert.equal(completenessCalls, 1, 'Duplicate response completion launched more than one follow-up');
    assert(statuses.includes('pending') && statuses.includes('running'), 'Pending/running feedback was not surfaced');
    assert.equal(record.status, 'complete');
}

{
    let completenessCalls = 0;
    let record = null;
    const coordinator = createCompletenessCoordinator({
        getSource: () => source('recovery'),
        getSettings: () => ({ enabled: true, autoScan: true, scanAfterEachResponse: true }),
        runEmbedded: async () => ({ ok: true, coverage: 'full-recovery' }),
        runCompleteness: async () => { completenessCalls += 1; return { ok: true }; },
        readRecord: () => record,
        writeRecord: (_source, value) => { record = value; },
    });
    const result = await coordinator.process(1);
    assert.equal(result.completeness, 'suppressed');
    assert.equal(completenessCalls, 0);
    assert.equal(record.reason, 'full-recovery-covered-response');
}

{
    let completenessCalls = 0;
    let record = null;
    const coordinator = createCompletenessCoordinator({
        getSource: () => source('skipped'),
        getSettings: () => ({ enabled: true, autoScan: false, scanAfterEachResponse: true }),
        runEmbedded: async () => ({ ok: false, coverage: 'skipped', reason: 'auto-disabled' }),
        runCompleteness: async () => { completenessCalls += 1; return { ok: true }; },
        readRecord: () => record,
        writeRecord: (_source, value) => { record = value; },
    });
    const result = await coordinator.process(1);
    assert.equal(result.reason, 'auto-disabled');
    assert.equal(completenessCalls, 0);
    assert.equal(record.status, 'complete', 'Skipped automatic work must not be recorded as a failure');
    assert.equal(record.coverage, 'skipped');
}

console.log('PASS v0.4.42 completeness response coordinator');
