import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyScanResult, parseScanJson } from '../v03/scanner.js';
import { createEmptyState } from '../v03/schema.js';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scannerSource = read('v03/scanner.js');

if (manifest.version !== '0.4.36' || !scannerSource.includes('PHASE74B_REQUIRED_LIFE_STATE_UPDATES')) {
    console.log('NPC State v0.4.36 required lifecycle-channel verification skipped before generated phase74b runtime');
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

// Real parsed model responses must explicitly include the lifecycle channel so omission cannot
// silently mean "not evaluated" and recreate the terminal-status miss.
assert.throws(
    () => parseScanJson(JSON.stringify(base)),
    /lifeStateUpdates\[object\]/,
    'Parsed model response without lifeStateUpdates was accepted',
);

const parsed = parseScanJson(JSON.stringify({ ...base, lifeStateUpdates: [] }));
assert.deepEqual(parsed.lifeStateUpdates, [], 'Explicit empty lifecycle channel was not accepted');

assert.throws(
    () => parseScanJson(JSON.stringify({ ...base, lifeStateUpdates: {} })),
    /lifeStateUpdates\[object\]/,
    'Malformed lifecycle channel was accepted',
);

// Direct/internal object reconciliation remains backward-compatible for old fixtures and
// migration helpers. It uses allowOmittedSupplemental=true rather than pretending to be a
// fresh model response.
const legacyDirect = applyScanResult(createEmptyState('phase74b-legacy-direct'), base, {
    sourceMessageId: 1,
    turn: 1,
});
assert.equal(legacyDirect.state.chatKey, 'phase74b-legacy-direct', 'Legacy direct object reconciliation broke');
assert.deepEqual(legacyDirect.state.npcs, [], 'Legacy direct object reconciliation invented dossiers');

console.log('NPC State v0.4.36 required lifecycle-channel contract verified');
