import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.41 settings/recovery hot-path marker: ' + label);
    return source.replace(from, to);
}

// PHASE84_SETTINGS_OBSERVER_RECOVERY_HOTPATH
// Avoid writing identical textContent values from the layout coordinator. textContent replaces
// child text nodes even when the string is identical, which is observable by the coordinator's
// childList MutationObserver and can otherwise schedule another layout pass indefinitely.
{
    const path = 'v03/settings-layout.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function ensureRelationships(drawer) {`,
        `// PHASE84_SETTINGS_OBSERVER_RECOVERY_HOTPATH: keep coordinator writes idempotent so its child-list observer cannot feed itself.\nexport function setTextIfChanged(node, value) {\n    if (node && node.textContent !== value) node.textContent = value;\n}\n\nfunction ensureRelationships(drawer) {`,
        'idempotent text helper',
    );
    source = replaceRequired(
        source,
        `    const label = relationship.querySelector?.('summary b');\n    if (label) label.textContent = 'Relationship Rubric';`,
        `    const label = relationship.querySelector?.('summary b');\n    setTextIfChanged(label, 'Relationship Rubric');`,
        'relationship rubric equality guard',
    );
    source = replaceRequired(
        source,
        `        const label = memory.querySelector?.('summary b');\n        if (label) label.textContent = 'Memory Rubric';`,
        `        const label = memory.querySelector?.('summary b');\n        setTextIfChanged(label, 'Memory Rubric');`,
        'memory rubric equality guard',
    );
    fs.writeFileSync(path, source);
}

// Branch safety is tiny UI status. Give the recovery overlay a narrow engine read rather than
// forcing it through getState(), whose compatibility contract clones the complete sidecar.
{
    const path = 'v03/engine.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    function getInjectionState(chatKey = getChatKey()) {`,
        `    function branchSafetyStatus(chatKey = getChatKey()) {\n        const key = chatKey || getChatKey();\n        const current = cache.get(key);\n        return current?.branchSafety ? structuredClone(current.branchSafety) : null;\n    }\n\n    function getInjectionState(chatKey = getChatKey()) {`,
        'branch safety narrow read',
    );
    source = replaceRequired(
        source,
        `        invalidate,\n        getInjectionState,`,
        `        invalidate,\n        branchSafetyStatus,\n        getInjectionState,`,
        'branch safety public engine surface',
    );
    fs.writeFileSync(path, source);
}

// Expose the narrow read to the standalone branch-recovery UI module.
{
    const path = 'v03/index.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    getState: () => engine.getState(getChatKey()),\n    hydrationStatus: () => engine.hydrationStatus(getChatKey()),`,
        `    getState: () => engine.getState(getChatKey()),\n    branchSafetyStatus: () => engine.branchSafetyStatus(getChatKey()),\n    hydrationStatus: () => engine.hydrationStatus(getChatKey()),`,
        'global branch safety status surface',
    );
    fs.writeFileSync(path, source);
}

// Recovery/rebase overlay reads are now narrow and null-safe. A null recoveryStatus() result is
// a valid "no active recovery" answer and must not trigger the legacy full-state fallback.
{
    const path = 'v03/branch-recovery-ui.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function state() {\n    try { return globalThis.NPCState?.getState?.() || null; }\n    catch { return null; }\n}\n\nexport function branchRecoveryRequired(value = state()) {\n    return Boolean(value?.branchSafety && value.branchSafety.status !== 'safe');\n}`,
        `export function readBranchSafetyStatus() {\n    try { return globalThis.NPCState?.branchSafetyStatus?.() ?? null; }\n    catch { return null; }\n}\n\nexport function readRecoveryStatus() {\n    try {\n        const api = globalThis.NPCState;\n        if (typeof api?.recoveryStatus === 'function') return api.recoveryStatus();\n        return null;\n    } catch { return null; }\n}\n\nexport function branchRecoveryRequired(value = readBranchSafetyStatus()) {\n    const safety = value?.branchSafety || value;\n    return Boolean(safety && safety.status !== 'safe');\n}`,
        'replace full-state helper with narrow status helpers',
    );
    source = replaceRequired(
        source,
        `    const current = state();\n    const required = branchRecoveryRequired(current);`,
        `    const current = readBranchSafetyStatus();\n    const required = branchRecoveryRequired(current);`,
        'rebase narrow branch read',
    );
    source = replaceRequired(
        source,
        `        const rebasedState = state();\n        if (rebasedState?.branchSafety?.status === 'safe') {`,
        `        const rebasedSafety = readBranchSafetyStatus();\n        if (rebasedSafety?.status === 'safe') {`,
        'rebase failure narrow branch read',
    );
    source = replaceRequired(
        source,
        `function recovery() {\n    try { return globalThis.NPCState?.recoveryStatus?.() || state()?.recovery || null; }\n    catch { return state()?.recovery || null; }\n}`,
        `function recovery() { return readRecoveryStatus(); }`,
        'null-safe recovery read',
    );
    source = replaceRequired(
        source,
        `    const current = state();\n    ensureRecoveryControl(host);`,
        `    const current = readBranchSafetyStatus();\n    ensureRecoveryControl(host);`,
        'render narrow branch read',
    );
    source = replaceRequired(
        source,
        `    const kind = String(current.branchSafety?.kind || '');`,
        `    const kind = String(current?.kind || '');`,
        'render direct branch safety kind',
    );
    if (source.includes('NPCState?.getState?.()')) throw new Error('Branch recovery UI still contains a full-state compatibility read');
    if (source.includes('state()?.recovery')) throw new Error('Branch recovery UI still falls back from null recovery status to full state');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State v0.4.41 settings observer and recovery UI hot-path hardening');
