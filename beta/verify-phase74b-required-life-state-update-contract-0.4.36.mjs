import assert from 'node:assert/strict';
import fs from 'node:fs';
import { consumeNpcStateControl } from '../v03/foreground.js';
import { applyScanResult, parseScanJson } from '../v03/scanner.js';
import { createEmptyState } from '../v03/schema.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scannerSource = read('v03/scanner.js');
const engineSource = read('v03/engine.js');
const foregroundSource = read('v03/foreground.js');
const indexSource = read('v03/index.js');

if (
    manifest.version !== '0.4.36'
    || !scannerSource.includes('PHASE74C_LIVE_LIFE_STATE_CONTRACT')
    || !foregroundSource.includes('PHASE74D_FOREGROUND_LIFE_STATE_BOUNDARY')
) {
    console.log('NPC State v0.4.36 live lifecycle-channel verification skipped before generated phase74d runtime');
    process.exit(0);
}

const base = {
    exchangeActiveNpcIds: [],
    inChatNpcIds: [],
    worldActiveNpcIds: [],
    npcs: [],
    socialEdges: [],
    familyFacts: [],
};

// Historical/public parser callers stay backward-compatible unless they opt into the new
// v0.4.36 live-model contract.
const legacyParsed = parseScanJson(JSON.stringify(base));
assert.deepEqual(legacyParsed.lifeStateUpdates, [], 'Default parser no longer accepts historical payloads without lifecycle channel');

// Actual v0.4.36 model consumers must explicitly include the lifecycle channel so omission
// cannot silently mean "not evaluated" and recreate the terminal-status miss.
assert.throws(
    () => parseScanJson(JSON.stringify(base), { requireLifeStateUpdates: true }),
    /lifeStateUpdates\[object\]/,
    'Live parser contract accepted a model response without lifeStateUpdates',
);

const parsed = parseScanJson(JSON.stringify({ ...base, lifeStateUpdates: [] }), { requireLifeStateUpdates: true });
assert.deepEqual(parsed.lifeStateUpdates, [], 'Explicit empty lifecycle channel was not accepted by live parser contract');

assert.throws(
    () => parseScanJson(JSON.stringify({ ...base, lifeStateUpdates: {} }), { requireLifeStateUpdates: true }),
    /lifeStateUpdates\[object\]/,
    'Malformed lifecycle channel was accepted by live parser contract',
);

// Direct/internal object reconciliation also remains backward-compatible for old fixtures and
// migration helpers. It does not pretend to be a fresh model response.
const legacyDirect = applyScanResult(createEmptyState('phase74d-legacy-direct'), base, {
    sourceMessageId: 1,
    turn: 1,
});
assert.equal(legacyDirect.state.chatKey, 'phase74d-legacy-direct', 'Legacy direct object reconciliation broke');
assert.deepEqual(legacyDirect.state.npcs, [], 'Legacy direct object reconciliation invented dossiers');

// Foreground transport has the same split boundary. Old stored payloads remain readable, but
// a newly generated foreground payload must explicitly prove lifecycle evaluation.
const block = payload => `<npc_state_v1>${JSON.stringify(payload)}</npc_state_v1>`;
const oldStored = consumeNpcStateControl(block(base));
assert.equal(oldStored.errors.length, 0, 'Legacy stored foreground payload became unreadable');
assert(oldStored.parsed, 'Legacy stored foreground payload did not parse');

const rejectedFresh = consumeNpcStateControl(block(base), { requireLifeStateUpdates: true });
assert.equal(rejectedFresh.parsed, null, 'Fresh foreground payload without lifecycle channel was accepted');
assert(rejectedFresh.errors.some(error => error.includes('lifeStateUpdates[object]')), 'Fresh foreground omission was not diagnosed');

const acceptedFresh = consumeNpcStateControl(block({ ...base, lifeStateUpdates: [] }), { requireLifeStateUpdates: true });
assert.equal(acceptedFresh.errors.length, 0, 'Fresh foreground payload with explicit lifecycle evaluation was rejected');
assert.deepEqual(acceptedFresh.parsed?.lifeStateUpdates, [], 'Fresh foreground lifecycle channel was not preserved');

// Separate scanner/recovery generation is strict on both first response and retry.
const strictCall = 'parseScanJson(raw, { requireLifeStateUpdates: true })';
assert.equal(engineSource.split(strictCall).length - 1, 2, 'Engine live/retry parsing is not lifecycle-channel strict');

// Only processEmbeddedScan, which handles a newly generated assistant message, opts into the
// strict foreground contract. Transport stripping and stored-payload replay remain compatible.
assert(
    foregroundSource.includes('parseScanJson(body, { requireLifeStateUpdates });'),
    'Foreground parser does not forward its lifecycle strictness option',
);
assert(
    indexSource.includes('const consumed = consumeNpcStateControl(message.mes, { requireLifeStateUpdates: true });'),
    'New foreground capture is not lifecycle-channel strict',
);
assert(
    indexSource.includes('const consumed = consumeNpcStateControl(meta.payload);'),
    'Stored foreground replay no longer uses the backward-compatible parser boundary',
);

console.log('NPC State v0.4.36 live lifecycle-channel contract verified');
