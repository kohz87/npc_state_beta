import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(path, 'utf8');

const phase12 = read('beta/verify-phase12-relationship-recovery-0.4.7.mjs');
const phase13 = read('beta/verify-phase13-milestone-gate-invariants-0.4.8.mjs');
const phase15 = read('beta/verify-phase15-force-rebase-0.4.10.mjs');
const phase16 = read('beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs');
const phase17 = read('beta/verify-phase17-second-order-hardening-0.4.12.mjs');

assert(phase12.includes("JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [], socialEdges: [] })"), 'v0.4.7 retry fixture is not persisted in release source');
assert(phase13.includes('Manifest is not a 0.4.8+ descendant'), 'v0.4.8 descendant assertion is not persisted in release source');
assert(phase15.includes('Manifest is older than the 0.4.10 force-rebase baseline'), 'v0.4.10 descendant assertion is not persisted in release source');
assert(phase16.includes('invalid payload structure or members') && phase16.includes('Manifest regressed below 0.4.11'), 'v0.4.11 verifier compatibility is not persisted in release source');
assert(phase17.includes('Manifest regressed below v0.4.12'), 'v0.4.12 descendant assertion is not persisted in release source');

const manifest = JSON.parse(read('manifest.json'));
const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 13, 'Manifest regressed below v0.4.13');

console.log('NPC State 0.4.13+ release source parity verified');
