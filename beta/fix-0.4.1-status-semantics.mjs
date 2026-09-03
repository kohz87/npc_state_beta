import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing status-semantics marker: ' + label);
    return source.replace(from, to);
}

function replaceAllRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing status-semantics marker: ' + label);
    return source.replaceAll(from, to);
}

// 1) Status is a current activity/situation/condition, never dossier lifecycle presence.
// Normalize legacy/model-produced lifecycle-only values away so old polluted dossiers heal
// on load while concrete statuses remain intact.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    'export function normalizeDossierLimits(value = {}) {',
    `const LIFECYCLE_ONLY_CURRENT_STATUSES = new Set([\n    'active', 'inactive', 'not active', 'currently active', 'currently inactive',\n    'present', 'not present', 'currently present', 'currently not present',\n    'in chat', 'not in chat', 'in the chat', 'not in the chat',\n    'in scene', 'not in scene', 'in the scene', 'not in the scene',\n    'on screen', 'off screen', 'active on screen', 'active off screen', 'inactive off screen',\n    'world active', 'world inactive', 'archived', 'unarchived', 'not archived',\n    'dossier active', 'dossier inactive',\n]);\n\nexport function normalizeCurrentStatus(value) {\n    const clean = text(value, 360);\n    if (!clean) return '';\n    return LIFECYCLE_ONLY_CURRENT_STATUSES.has(normalizeName(clean)) ? '' : clean;\n}\n\nexport function normalizeDossierLimits(value = {}) {`,
    'status normalizer',
);
schema = replaceRequired(
    schema,
    '        status: text(input.status, 360),',
    '        status: normalizeCurrentStatus(input.status),',
    'normalize stored status',
);
write('v03/schema.js', schema);

// 2) Scanner apply path must ignore bad lifecycle-only status patches instead of replacing
// a useful concrete prior status.
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    '    normalizeApparentAge,\n    normalizeDossierLimits,',
    '    normalizeApparentAge,\n    normalizeCurrentStatus,\n    normalizeDossierLimits,',
    'scanner status normalizer import',
);
scanner = replaceRequired(
    scanner,
    "function applyLivePatch(npc, patch) {\n    const next = structuredClone(npc);\n    for (const field of ['mood', 'location', 'goal', 'status']) {\n        const value = String(patch?.[field] ?? '').trim();\n        if (value) next[field] = value;\n    }\n    if (Number.isFinite(Number(patch?.importance))) next.importance = Math.max(next.importance || 0, Math.min(100, Math.max(0, Math.round(Number(patch.importance)))));\n    return next;\n}",
    "function applyLivePatch(npc, patch) {\n    const next = structuredClone(npc);\n    for (const field of ['mood', 'location', 'goal']) {\n        const value = String(patch?.[field] ?? '').trim();\n        if (value) next[field] = value;\n    }\n    const status = normalizeCurrentStatus(patch?.status);\n    if (status) next.status = status;\n    if (Number.isFinite(Number(patch?.importance))) next.importance = Math.max(next.importance || 0, Math.min(100, Math.max(0, Math.round(Number(patch.importance)))));\n    return next;\n}",
    'scanner current status guard',
);
scanner = replaceAllRequired(
    scanner,
    "relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: '', importance: 0,",
    "relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0,",
    'scanner output contracts',
);
scanner = replaceRequired(
    scanner,
    "        '- worldActiveNpcIds: NPCs explicitly active off-screen in the current world state. Keep this separate from in-chat participation.',",
    "        '- worldActiveNpcIds: NPCs explicitly active off-screen in the current world state. Keep this separate from in-chat participation.',\n        '- status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',",
    'full scanner status semantics',
);
scanner = replaceRequired(
    scanner,
    "        'Use the supplied chat window to reconcile grounded stable profile facts, current status when supported, durable memories, and key relationships for THIS NPC only.',",
    "        'Use the supplied chat window to reconcile grounded stable profile facts, current activity/situation/condition when supported, durable memories, and key relationships for THIS NPC only.',\n        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; lifecycle presence is tracked separately.',",
    'targeted refresh status semantics',
);
write('v03/scanner.js', scanner);

// 3) Foreground embedded contract needs the same unambiguous definition.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',",
    "        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',\n        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',",
    'foreground status semantics',
);
injection = replaceRequired(
    injection,
    '\"status\":\"\",\"importance\":0',
    '\"status\":\"concrete current activity, situation, or condition; never lifecycle presence\",\"importance\":0',
    'foreground status output shape',
);
write('v03/injection.js', injection);

// 4) Make the UI language match the actual semantic field while retaining the internal
// property name `status` for storage compatibility.
let dossierView = read('v03/dossier-view.js');
dossierView = replaceRequired(
    dossierView,
    "            ${currentFact('Status', npc.status)}",
    "            ${currentFact('Activity / condition', npc.status)}",
    'dossier current status label',
);
write('v03/dossier-view.js', dossierView);

let ui = read('v03/ui.js');
ui = replaceRequired(
    ui,
    "${field('Mood', 'npc_state_v3_edit_mood', npc.mood)}${field('Location', 'npc_state_v3_edit_location', npc.location)}${field('Goal', 'npc_state_v3_edit_goal', npc.goal)}${field('Status', 'npc_state_v3_edit_status', npc.status)}",
    "${field('Mood', 'npc_state_v3_edit_mood', npc.mood)}${field('Location', 'npc_state_v3_edit_location', npc.location)}${field('Goal', 'npc_state_v3_edit_goal', npc.goal)}${field('Activity / condition', 'npc_state_v3_edit_status', npc.status)}",
    'editor current status label',
);
write('v03/ui.js', ui);

let changelog = read('CHANGELOG.md');
const line = '- Clarified dossier current status semantics: status now means the NPC concrete immediate activity, situation, or condition, never active/inactive/in-chat/off-screen/archive lifecycle state. Lifecycle-only status pollution is rejected deterministically and existing generic values normalize away on load.';
if (!changelog.includes(line)) {
    changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
    write('CHANGELOG.md', changelog);
}

console.log('Hardened NPC State 0.4.1 current status semantics');
