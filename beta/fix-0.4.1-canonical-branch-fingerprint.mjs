import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing canonical-branch-fingerprint marker: ' + label);
    return source.replace(from, to);
}

let branches = read('v03/branches.js');
const helper = `
function canonicalAssistantMessageText(value = '') {
    const source = String(value ?? '');
    const withoutNpc = source
        .replace(/<npc_state_v1\\b[^>]*>[\\s\\S]*?<\\/npc_state_v1\\s*>/gi, '')
        .replace(/<npc_state_v1\\b[^>]*>[\\s\\S]*$/gi, '');
    const withoutInventory = withoutNpc.replace(/<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*?-->\\.?/gi, '');
    return withoutInventory.replace(/\\n{3,}/g, '\\n\\n').trimEnd();
}
`;
branches = replaceRequired(
    branches,
    '\nexport function fingerprintMessage(message = {}) {',
    helper + '\nexport function fingerprintMessage(message = {}) {',
    'canonical helper insertion',
);
branches = replaceRequired(
    branches,
    "    return `${role}:${swipe}:${fnv1a(String(message.mes ?? ''))}`;",
    "    const text = role === 'a' ? canonicalAssistantMessageText(message.mes) : String(message.mes ?? '');\n    return `${role}:${swipe}:${fnv1a(text)}`;",
    'fingerprint canonical text',
);
write('v03/branches.js', branches);

let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "        branchSafety: { status: 'safe', kind: '', reason: '' },\n        migration: null,",
    "        branchSafety: { status: 'safe', kind: '', reason: '' },\n        branchFingerprintVersion: 2,\n        migration: null,",
    'empty-state fingerprint version',
);
schema = replaceRequired(
    schema,
    "        branchSafety: {\n            status: branchSafetyStatus,\n            kind: branchSafetyStatus === 'safe' ? '' : branchSafetyKind,\n            reason: text(rawSafety.reason, 500),\n        },\n        migration: input.migration && typeof input.migration === 'object' ? structuredClone(input.migration) : null,",
    "        branchSafety: {\n            status: branchSafetyStatus,\n            kind: branchSafetyStatus === 'safe' ? '' : branchSafetyKind,\n            reason: text(rawSafety.reason, 500),\n        },\n        branchFingerprintVersion: Math.max(0, Math.trunc(Number(input.branchFingerprintVersion) || 0)),\n        migration: input.migration && typeof input.migration === 'object' ? structuredClone(input.migration) : null,",
    'normalized fingerprint version',
);
write('v03/schema.js', schema);

let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "            state = ensureBranchBase(normalizeState(state, chatKey), getContext().chat || []);\n            if (importedStable) {\n                state = await persist(chatKey, state);\n                notify('success', 'Cloned stable NPC State v0.3 dossiers into an independent v0.4.1 beta sidecar. Stable data was not modified.');\n            }",
    "            const normalized = normalizeState(state, chatKey);\n            const fingerprintUpgraded = Number(normalized.branchFingerprintVersion || 0) < 2;\n            if (fingerprintUpgraded) {\n                // Stored v0.4.1 lineages were hashed before transient foreground controls were\n                // canonicalized, so their old hashes cannot be safely translated after cleanup.\n                // Preserve all durable NPC data, reset only rollback metadata, and accept the\n                // currently visible chat as the new canonical baseline once.\n                normalized.checkpoints = [];\n                normalized.branchBase = null;\n                normalized.branchHeadLineage = [];\n                normalized.branchSafety = { status: 'safe', kind: '', reason: '' };\n                normalized.branchFingerprintVersion = 2;\n            }\n            state = ensureBranchBase(normalized, getContext().chat || []);\n            if (importedStable || fingerprintUpgraded) {\n                state = await persist(chatKey, state);\n                if (importedStable) {\n                    notify('success', 'Cloned stable NPC State v0.3 dossiers into an independent v0.4.1 beta sidecar. Stable data was not modified.');\n                } else if (fingerprintUpgraded) {\n                    notify('info', 'Upgraded branch checkpoint fingerprints for transport-safe rollback. Existing dossiers were preserved; old rollback hashes were reset once.');\n                }\n            }",
    'one-time fingerprint lineage upgrade',
);
write('v03/engine.js', engine);

const { fingerprintMessage } = await import('../v03/branches.js');
const plain = fingerprintMessage({ is_user: false, swipe_id: 0, mes: 'Story text.' });
const withControls = fingerprintMessage({
    is_user: false,
    swipe_id: 0,
    mes: 'Story text.\n\n<npc_state_v1>{"npcs":[]}</npc_state_v1>\n\n<!-- INVENTORY_BLOCK_UPDATE {"mode":"patch","ops":[]} -->.',
});
const edited = fingerprintMessage({ is_user: false, swipe_id: 0, mes: 'Story text changed.' });
if (plain !== withControls) throw new Error('Transient NPC/Inventory controls still alter assistant branch fingerprints');
if (plain === edited) throw new Error('Visible narrative edits no longer alter assistant branch fingerprints');

let changelog = read('CHANGELOG.md');
const changelogLine = '- Canonicalized assistant-message branch fingerprints so transient `<npc_state_v1>` and `INVENTORY_BLOCK_UPDATE` controls do not make an unchanged visible narrative look like a different branch after post-generation cleanup; existing 0.4.1 sidecars perform a one-time rollback-hash reset while preserving dossiers, relationships, and memories.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Canonicalized NPC State 0.4.1 branch fingerprints');
