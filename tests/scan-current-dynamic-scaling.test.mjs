import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { buildScanPrompt, buildTargetedRefreshPrompt } from '../src/scanner.js';

function summaryFor(index) {
    return (`CURRENT_DYNAMIC_${String(index).padStart(2, '0')}_` + 'relationship-context '.repeat(18)).trim();
}

function makeState(count, presentIds = new Set(['npc-0'])) {
    const state = createEmptyState('chat:scan-current-dynamic-scaling');
    state.npcs = Array.from({ length: count }, (_, index) => normalizeNpc({
        id: `npc-${index}`,
        name: `Person${String(index).padStart(2, '0')}`,
        present: presentIds.has(`npc-${index}`),
        worldActive: false,
        relationship: { trust: index + 1, affection: index % 7, desire: 0, tension: 0 },
        relationshipSummary: summaryFor(index),
    }));
    return state;
}

function scanPrompt(state, assistantText = 'Person00 answers Lucien.') {
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I speak with Person00.' },
        { is_user: false, name: 'Narrator', mes: assistantText },
    ];
    return buildScanPrompt({ state, chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
}

function existingDossiers(prompt) {
    const marker = 'EXISTING DOSSIERS:\n';
    const endMarker = '\n\nOLDER CONTEXT';
    const start = prompt.indexOf(marker);
    assert.notEqual(start, -1, 'EXISTING DOSSIERS marker must exist');
    const end = prompt.indexOf(endMarker, start + marker.length);
    assert.notEqual(end, -1, 'OLDER CONTEXT marker must follow dossier JSON');
    return JSON.parse(prompt.slice(start + marker.length, end));
}

function rowsWithCurrentDynamic(rows) {
    return rows.filter(row => Object.prototype.hasOwnProperty.call(row, 'relationshipSummary'));
}

test('Full Scan Current Dynamic payload scales with relevant NPCs rather than total roster size', () => {
    const smallRows = existingDossiers(scanPrompt(makeState(2)));
    const largeRows = existingDossiers(scanPrompt(makeState(50)));

    const smallDynamicRows = rowsWithCurrentDynamic(smallRows);
    const largeDynamicRows = rowsWithCurrentDynamic(largeRows);

    assert.equal(smallDynamicRows.length, 1);
    assert.equal(largeDynamicRows.length, 1);
    assert.equal(smallDynamicRows[0].id, 'npc-0');
    assert.equal(largeDynamicRows[0].id, 'npc-0');
    assert.equal(largeDynamicRows[0].relationshipSummary, summaryFor(0));
    assert.equal(largeRows.length, 50, 'continuity roster itself must remain complete');
    assert.ok(!Object.prototype.hasOwnProperty.call(largeRows[49], 'relationshipSummary'));
});

test('an explicitly referenced off-screen NPC receives Current Dynamic context without expanding the whole roster', () => {
    const state = makeState(30, new Set());
    const rows = existingDossiers(scanPrompt(state, 'Person17 sends Lucien a message and speaks about their changing trust.'));
    const dynamicRows = rowsWithCurrentDynamic(rows);

    assert.deepEqual(dynamicRows.map(row => row.id), ['npc-0', 'npc-17']);
    assert.equal(dynamicRows.find(row => row.id === 'npc-17').relationshipSummary, summaryFor(17));
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[29], 'relationshipSummary'));
});

test('targeted Refresh always receives the target Current Dynamic', () => {
    const npc = makeState(1).npcs[0];
    const chat = [
        { is_user: true, name: 'Lucien', mes: 'I ask how things stand between us.' },
        { is_user: false, name: 'Narrator', mes: 'Person00 answers.' },
    ];
    const prompt = buildTargetedRefreshPrompt({ npc, chat, assistantMessageId: 1, scanDepth: 8, playerName: 'Lucien' });
    assert.match(prompt, new RegExp(summaryFor(0).slice(0, 40)));
});
