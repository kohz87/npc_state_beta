import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult, parseScanJson } from '../v03/scanner.js';
import { createEmptyState } from '../v03/schema.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scannerSource = read('v03/scanner.js');
const engineSource = read('v03/engine.js');
const foregroundSource = read('v03/foreground.js');

if (manifest.version !== '0.4.36' || !scannerSource.includes('PHASE74C_LIVE_LIFE_STATE_CONTRACT')) {
    console.log('NPC State v0.4.36 live lifecycle-channel verification skipped before generated phase74c runtime');
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
// migration helpers. It uses allowOmittedSupplemental=true rather than pretending to be a
// fresh model response.
const legacyDirect = applyScanResult(createEmptyState('phase74c-legacy-direct'), base, {
    sourceMessageId: 1,
    turn: 1,
});
assert.equal(legacyDirect.state.chatKey, 'phase74c-legacy-direct', 'Legacy direct object reconciliation broke');
assert.deepEqual(legacyDirect.state.npcs, [], 'Legacy direct object reconciliation invented dossiers');

// Both live routes are fail-closed: separate scanner/recovery generation and embedded
// foreground capture require the lifecycle channel on every fresh model response.
const strictCall = 'parseScanJson(raw, { requireLifeStateUpdates: true })';
assert.equal(engineSource.split(strictCall).length - 1, 2, 'Engine live/retry parsing is not lifecycle-channel strict');
assert(
    foregroundSource.includes('parseScanJson(body, { requireLifeStateUpdates: true })'),
    'Foreground embedded capture is not lifecycle-channel strict',
);

console.log('NPC State v0.4.36 live lifecycle-channel contract verified');
