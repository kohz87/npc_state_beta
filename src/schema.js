import * as core from './schema-core.js';

export * from './schema-core.js';

// Release version, persisted schema version, and model-output contract version are
// intentionally independent. v0.5.0 changes runtime behavior and model contract only.
export const NPC_STATE_VERSION = '0.5.0';
export const NPC_STATE_SCHEMA_VERSION = 1;

export function createEmptyState(chatKey = '') {
    const state = core.createEmptyState(chatKey);
    state.schemaVersion = NPC_STATE_SCHEMA_VERSION;
    state.appVersion = NPC_STATE_VERSION;
    return state;
}

export function normalizeState(input = {}, chatKey = '') {
    const state = core.normalizeState(input, chatKey);
    state.schemaVersion = NPC_STATE_SCHEMA_VERSION;
    state.appVersion = NPC_STATE_VERSION;
    return state;
}
