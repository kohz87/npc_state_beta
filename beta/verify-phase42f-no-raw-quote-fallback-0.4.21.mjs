import assert from 'node:assert/strict';
import { normalizeNpc } from '../v03/schema.js';
import { dossierHtml } from '../v03/dossier-view.js';

const npc = normalizeNpc({
    id: 'npc-elspeth',
    name: 'Elspeth Meyer',
    relationshipHistory: [{
        impact: 'ordinary',
        delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
        evidence: 'Lucien returned the key before sunset.',
        reason: '',
        sourceMessageId: 91,
        turn: 91,
        at: 9100,
    }],
});

const html = dossierHtml(npc);
const start = html.indexOf('Recent relationship changes');
const end = html.indexOf('Relationship evaluation &amp; scoring', start);
const historyHtml = html.slice(start, end);
assert(historyHtml.includes('No explanation recorded.'), 'Raw-evidence-only history did not use the neutral fallback');
assert(!historyHtml.includes('Lucien returned the key before sunset.'), 'Raw evidence quotation was misrepresented as a relationship explanation');

console.log('NPC State 0.4.21 raw evidence fallback verified');
