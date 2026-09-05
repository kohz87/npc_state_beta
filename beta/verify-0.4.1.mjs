import fs from 'node:fs';
import { consumeNpcStateControl } from '../v03/foreground.js';
import {
    createEmptyState,
    normalizeKeyRelationshipEntries,
    normalizeNpc,
    snapshotForCheckpoint,
} from '../v03/schema.js';
import { applyScanResult } from '../v03/scanner.js';
import {
    fingerprintMessage,
    recordCheckpoint,
    reconcileToCurrentBranch,
} from '../v03/branches.js';
import {
    createNpcStateBundle,
    parseNpcStateBundle,
    bundleSuggestedFilename,
} from '../v03/bundle.js';
import { buildInjection } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function file(path) {
    return fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}

// Foreground parser must remove only NPC transport and preserve Inventory transports.
{
    const legacyInventory = '<!-- INVENTORY_BLOCK_UPDATE {"mode":"patch","ops":[]} -->.';
    const v05Inventory = '<!-- INVENTORY_BLOCK_V05\n<Inventory>\nCoin Pouch | 1 | 90 Gold\n</Inventory>\n-->';
    const plainInventory = '<Inventory>\nCoin Pouch | 1 | 90 Gold\n</Inventory>';
    const payload = '{"exchangeActiveNpcIds":[],"inChatNpcIds":[],"worldActiveNpcIds":[],"npcs":[],"socialEdges":[]}';

    for (const inventory of [legacyInventory, v05Inventory]) {
        const valid = consumeNpcStateControl('Story text.\n\n<npc_state_v1>' + payload + '</npc_state_v1>\n\n' + inventory);
        assert(valid.found && !valid.errors.length && valid.parsed, 'Valid NPC foreground payload did not parse');
        assert(valid.cleanedText.includes(inventory.includes('V05') ? 'INVENTORY_BLOCK_V05' : 'INVENTORY_BLOCK_UPDATE'), 'NPC stripping consumed Inventory transport');
        assert(!valid.cleanedText.includes('npc_state_v1'), 'NPC transport was not stripped');

        const truncated = consumeNpcStateControl('Story\n<npc_state_v1>{"broken":true}\n' + inventory);
        assert(truncated.errors.length, 'Truncated NPC block was not rejected');
        assert(!truncated.cleanedText.includes('npc_state_v1'), 'Truncated NPC block leaked');
        assert(truncated.cleanedText.includes(inventory.includes('V05') ? 'INVENTORY_BLOCK_V05' : 'INVENTORY_BLOCK_UPDATE'), 'Truncated NPC cleanup consumed Inventory transport');
    }

    const truncatedPlain = consumeNpcStateControl('Story\n<npc_state_v1>{"broken":true}\n' + plainInventory);
    assert(truncatedPlain.errors.length && truncatedPlain.cleanedText.includes('<Inventory>'), 'Truncated NPC cleanup did not preserve plain Inventory snapshot');

    const duplicate = consumeNpcStateControl('Story\n<npc_state_v1>' + payload + '</npc_state_v1>\n<npc_state_v1>' + payload + '</npc_state_v1>\n' + v05Inventory);
    assert(duplicate.errors.length, 'Duplicate NPC blocks were not rejected');
    assert(!duplicate.cleanedText.includes('npc_state_v1'), 'Duplicate NPC blocks leaked');
    assert(duplicate.cleanedText.includes('INVENTORY_BLOCK_V05'), 'Duplicate cleanup consumed Inventory v0.5 transport');
}

// Structured collection values must never become [object Object].
{
    const shaped = normalizeKeyRelationshipEntries([
        { name: 'Astra', relation: 'sister' },
        { npc: 'Brina', relationship: 'mother' },
        '[object Object]',
    ]);
    assert(shaped[0] === 'Astra - sister' && shaped[1] === 'Brina - mother', 'Structured key relationships were not normalized');
    assert(!shaped.some(value => value.includes('[object Object]')), 'Object garbage survived key relationship normalization');

    const npc = normalizeNpc({
        name: 'Astra',
        aliases: [{ alias: 'Ash' }, '[object Object]'],
        behaviorProfile: [{ behavior: 'Protective of Kiri' }],
        mannerisms: [{ description: 'Folds her wings when nervous' }],
        memories: [{ memory: 'Lucien sheltered her during the storm' }],
        keyRelationships: [{ name: 'Kiri', relation: 'sister' }],
    });
    const all = [...npc.aliases, ...npc.behaviorProfile, ...npc.mannerisms, ...npc.memories, ...npc.keyRelationships];
    assert(!all.some(value => value === '[object Object]'), 'Generic collection object leaked as [object Object]');
    assert(npc.aliases.includes('Ash'), 'Structured alias was not normalized');
    assert(npc.behaviorProfile.includes('Protective of Kiri'), 'Structured behavior was not normalized');
    assert(npc.mannerisms.includes('Folds her wings when nervous'), 'Structured mannerism was not normalized');
    assert(npc.memories.includes('Lucien sheltered her during the storm'), 'Structured memory was not normalized');
}

// One embedded payload may bootstrap multiple NPCs even with imperfect activity arrays.
{
    const applied = applyScanResult(createEmptyState('multi-new'), {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [
            { id: '', name: 'Astra', role: 'daughter', keyRelationships: ['Kiri - sister'] },
            { id: '', name: 'Kiri', role: 'daughter', keyRelationships: ['Astra - sister'] },
            { id: '', name: 'Brina', role: 'mother', keyRelationships: ['Astra - daughter', 'Kiri - daughter'] },
        ],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1 });
    assert(applied.state.npcs.length === 3, 'Secondary idless bootstrap NPCs were discarded');
    assert(applied.state.npcs.every(npc => npc.role), 'Secondary bootstrap profile patches were not applied');
}

// Multiple existing patches apply independently; world-only patches remain restricted.
{
    const seeded = applyScanResult(createEmptyState('multi-existing'), {
        exchangeActiveNpcIds: ['Astra', 'Kiri', 'Brina'],
        inChatNpcIds: ['Astra', 'Kiri', 'Brina'],
        worldActiveNpcIds: [],
        npcs: [
            { id: '', name: 'Astra', role: 'daughter' },
            { id: '', name: 'Kiri', role: 'daughter' },
            { id: '', name: 'Brina', role: 'mother' },
        ],
        socialEdges: [],
    }, { sourceMessageId: 1, turn: 1 });

    const id = name => seeded.state.npcs.find(npc => npc.name === name).id;
    const updated = applyScanResult(seeded.state, {
        exchangeActiveNpcIds: ['Astra'],
        inChatNpcIds: ['Astra'],
        worldActiveNpcIds: [],
        npcs: [
            { id: id('Astra'), name: 'Astra', status: 'ready', keyRelationships: ['Kiri - sister'] },
            { id: id('Kiri'), name: 'Kiri', status: 'watchful', keyRelationships: ['Astra - sister'] },
            { id: id('Brina'), name: 'Brina', status: 'protective', keyRelationships: ['Astra - daughter', 'Kiri - daughter'] },
        ],
        socialEdges: [],
    }, { sourceMessageId: 2, turn: 2, applyReturnedNpcPatches: true });

    assert(updated.state.npcs.find(n => n.name === 'Kiri').status === 'watchful', 'Secondary existing NPC patch was discarded');
    assert(updated.state.npcs.find(n => n.name === 'Brina').keyRelationships.includes('Kiri - daughter'), 'Secondary collection update was discarded');

    const worldOnly = applyScanResult(updated.state, {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: ['Brina'],
        npcs: [{ id: id('Brina'), name: 'Brina', role: 'queen', location: 'North road' }],
        socialEdges: [],
    }, { sourceMessageId: 3, turn: 3, applyReturnedNpcPatches: true });
    const brina = worldOnly.state.npcs.find(n => n.name === 'Brina');
    assert(brina.role !== 'queen', 'World-only patch changed stable profile');
    assert(brina.location === 'North road', 'World-only patch did not update live location');
}

// Branch identity follows visible narrative, not hidden transports or mutable swipe indexes.
{
    const plain = fingerprintMessage({ is_user: false, swipe_id: 0, mes: 'Story text.' });
    const renumbered = fingerprintMessage({ is_user: false, swipe_id: 9, mes: 'Story text.' });
    const npcControl = fingerprintMessage({ is_user: false, swipe_id: 2, mes: 'Story text.\n<npc_state_v1>{"npcs":[]}</npc_state_v1>' });
    const legacyInventory = fingerprintMessage({ is_user: false, swipe_id: 3, mes: 'Story text.\n<!-- INVENTORY_BLOCK_UPDATE {"mode":"patch","ops":[]} -->.' });
    const v05 = fingerprintMessage({ is_user: false, swipe_id: 4, mes: 'Story text.\n<!-- INVENTORY_BLOCK_V05\n<Inventory>\nCoin | 1 | 10 Gold\n</Inventory>\n-->' });
    const plainInventory = fingerprintMessage({ is_user: false, swipe_id: 5, mes: 'Story text.\n<Inventory>\nCoin | 1 | 10 Gold\n</Inventory>' });
    const edited = fingerprintMessage({ is_user: false, swipe_id: 0, mes: 'Story text changed.' });
    assert(plain === renumbered && plain === npcControl && plain === legacyInventory && plain === v05 && plain === plainInventory, 'Machine state or swipe index altered branch identity');
    assert(plain !== edited, 'Visible narrative edit did not alter branch identity');
}

// Checkpoints are lightweight and swipe churn cannot consume the 48-entry window.
{
    let state = createEmptyState('branch-test');
    state.npcs.push(normalizeNpc({ id: 'npc-a', name: 'Astra', status: 'before', portrait: { dataUrl: 'data:image/webp;base64,' + 'x'.repeat(20000) } }));
    const snap = snapshotForCheckpoint(state);
    assert(snap.npcs[0].portrait === null, 'Portrait payload leaked into checkpoint snapshot');

    const firstChat = [
        { is_user: true, mes: 'Hi' },
        { is_user: false, swipe_id: 0, mes: 'A' },
    ];
    state = recordCheckpoint(state, firstChat, 1, 'first');

    state.npcs[0].status = 'after';
    const longerChat = [
        ...firstChat,
        { is_user: true, mes: 'Next' },
        { is_user: false, swipe_id: 0, mes: 'B' },
    ];
    state = recordCheckpoint(state, longerChat, 3, 'later');

    const currentPortrait = state.npcs[0].portrait.dataUrl;
    const restored = reconcileToCurrentBranch(state, firstChat).state;
    assert(restored.npcs[0].status === 'before', 'Rollback did not restore timeline dossier state');
    assert(restored.npcs[0].portrait?.dataUrl === currentPortrait, 'Rollback did not preserve current portrait presentation data');

    const swipeChat = structuredClone(firstChat);
    let swipeState = restored;
    for (let swipe = 0; swipe < 12; swipe += 1) {
        swipeChat[1] = { is_user: false, swipe_id: swipe, mes: 'Variant ' + swipe };
        swipeState = recordCheckpoint(swipeState, swipeChat, 1, 'swipe');
    }
    assert(swipeState.checkpoints.filter(cp => cp.messageId === 1).length === 4, 'Swipe variants did not preserve the four newest sibling checkpoints');
}

// 0.4.1 bundles must parse themselves while 0.3.x remains compatible.
{
    const state = createEmptyState('bundle-test');
    state.npcs.push(normalizeNpc({ id: 'npc-astra', name: 'Astra' }));
    const bundle = createNpcStateBundle(state);
    const parsed = parseNpcStateBundle(bundle);
    assert(parsed.appVersion === bundle.appVersion, 'Current bundle did not parse its own version');
    assert(bundleSuggestedFilename(bundle).includes('npc-state-v3-chat-backup'), '0.4.1 bundle filename generation failed');
    const legacy = structuredClone(bundle);
    legacy.appVersion = '0.3.2';
    parseNpcStateBundle(legacy);
}

// Identity directory and rich dossier continuity share the configured continuity budget.
{
    const state = createEmptyState('budget-test');
    for (let i = 0; i < 400; i += 1) {
        state.npcs.push(normalizeNpc({
            id: 'npc-' + i,
            name: 'Campaign NPC ' + String(i).padStart(3, '0') + ' ' + 'X'.repeat(40),
            role: 'role-' + i,
        }));
    }
    const prompt = buildInjection(state, { enabled: true, autoScan: false, inject: true, injectLimit: 20, injectBudgetTokens: 512 });
    assert(prompt.includes('Campaign NPC 000'), 'Identity directory unexpectedly empty');
    assert(!prompt.includes('Campaign NPC 399'), 'Identity directory ignored the configured continuity budget');
}

// Static invariants that are expensive or awkward to instantiate outside SillyTavern.
{
    const engine = file('v03/engine.js');
    const index = file('v03/index.js');
    const foreground = file('v03/foreground.js');
    const injection = file('v03/injection.js');
    const branches = file('v03/branches.js');
    const schema = file('v03/schema.js');
    const scanner = file('v03/scanner.js');
    const historyUi = file('v03/relationship-history-ui.js');
    const storage = file('v03/storage.js');

    assert(historyUi.includes('extension_settings.npc_state_beta'), 'Relationship-history UI escaped the beta settings namespace');
    assert(!historyUi.includes('extension_settings.npc_state;'), 'Relationship-history UI still writes stable settings');
    assert(engine.includes("reason: 'stale-operation'"), 'Embedded stale-operation guard missing');
    assert(engine.includes("state.branchSafety?.status !== 'safe'"), 'Unsafe branch mutation gate missing');
    assert(engine.includes('parsedRaw.npcs'), 'Targeted Refresh deterministic filter missing');
    assert(foreground.includes('INVENTORY_BLOCK_V05') && injection.includes('INVENTORY_BLOCK_V05') && branches.includes('INVENTORY_BLOCK_V05'), 'Inventory Block v0.5 compatibility incomplete');
    assert(injection.includes('maxChars - dossierBudget') && injection.includes('directoryRaw.slice(0, directoryBudget)'), 'Identity directory is not constrained to the remaining continuity budget');
    assert(schema.includes('portrait: null') && branches.includes('preserveCurrentPresentation'), 'Portrait-light checkpoint handling missing');
    assert(scanner.includes('collectionPatchEntry') && schema.includes('collectionEntry'), 'Generic collection normalization missing');
    assert(schema.includes('branchFingerprintVersion: 3'), 'Branch fingerprint schema version is not 3');
    assert(storage.includes('npc-state-v04-beta-') && storage.includes('npc_state_v3_chat_data'), 'Beta persistence naming/schema compatibility drifted');
    assert(index.includes('npc_state_beta'), 'Beta extension namespace missing');
    assert(!engine.includes('readLegacyV02Sidecar'), 'v0.2 migration unexpectedly returned');
}

console.log('NPC State 0.4.1 consolidated hardening verification passed');
