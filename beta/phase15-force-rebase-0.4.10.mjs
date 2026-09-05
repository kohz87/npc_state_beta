import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.10 force-rebase marker: ' + label);
    return source.replace(from, to);
}

// Preserve the latest already-scanned marker only when the force rebase is accepting
// the exact same tracked lineage. This lets the post-rebase force scan rebuild live
// continuity while scanner.js/engine.js keep relationship deltas one-shot.
{
    const path = 'v03/branches.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `    const divergenceMessageId = branchDivergenceMessageId(source, chat);\n    const next = normalizeState(source, source.chatKey);`,
        `    const divergenceMessageId = branchDivergenceMessageId(source, chat);\n    const latestAssistantId = latestAssistantMessageId(chat);\n    const preserveLatestScannedMessage = divergenceMessageId === null\n        && Number.isInteger(source.lastScannedMessageId)\n        && source.lastScannedMessageId === latestAssistantId;\n    const next = normalizeState(source, source.chatKey);`,
        'rebase preserve marker setup',
    );
    source = replaceRequired(
        source,
        `    next.lastScannedMessageId = null;\n    next.checkpoints = [];`,
        `    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;\n    next.checkpoints = [];`,
        'rebase last scanned reset',
    );
    fs.writeFileSync(path, source);
}

{
    const path = 'v03/branch-recovery-ui.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        `const BANNER_ID = 'npc_state_v3_branch_recovery';\nlet started = false;`,
        `const BANNER_ID = 'npc_state_v3_branch_recovery';\nconst FORCE_ID = 'npc_state_v3_force_rebase';\nlet started = false;`,
        'force control id',
    );

    source = replaceRequired(
        source,
        `#\${BANNER_ID} button{margin:0}#\${BANNER_ID}[data-running="1"] button{opacity:.65;pointer-events:none}\`;`,
        `#\${BANNER_ID} button{margin:0}#\${BANNER_ID}[data-running="1"] button{opacity:.65;pointer-events:none}\n#\${FORCE_ID} button{margin:0}#\${FORCE_ID}[data-running="1"] button{opacity:.65;pointer-events:none}\`;`,
        'force control styles',
    );

    source = replaceRequired(
        source,
        `async function rebaseCurrentChat() {\n    if (running) return;\n    const current = state();\n    if (!branchRecoveryRequired(current)) return render();\n    const accepted = globalThis.confirm?.(\n        'Rebase NPC State to the current chat timeline?\\n\\n' +\n        'This preserves durable profile canon, memories, portraits, manual locks, archives, social ties, deletion tombstones, and manual relationship edits. Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back before the new branch base is accepted. It then clears live in-chat state, chat-local message references, and incompatible branch checkpoints before scanning the latest surviving assistant exchange.\\n\\n' +\n        'Older facts without recoverable timeline provenance may still remain until later scans revise them or you edit the dossier manually.'\n    );`,
        `async function rebaseCurrentChat(force = false) {\n    if (running) return;\n    const current = state();\n    const required = branchRecoveryRequired(current);\n    if (!required && force !== true) return render();\n    const accepted = globalThis.confirm?.(\n        (!required && force === true\n            ? 'Force rebase NPC State to the current chat timeline even though branch safety is currently marked safe?\\n\\n'\n            : 'Rebase NPC State to the current chat timeline?\\n\\n') +\n        'This preserves durable profile canon, memories, portraits, manual locks, archives, social ties, deletion tombstones, and manual relationship edits. Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back before the new branch base is accepted. It then clears live in-chat state, chat-local message references, and incompatible branch checkpoints before scanning the latest surviving assistant exchange.\\n\\n' +\n        'If this exact latest exchange was already scanned on the same lineage, NPC State preserves that scan marker so the refresh cannot apply its relationship delta twice. Older facts without recoverable timeline provenance may still remain until later scans revise them or you edit the dossier manually.'\n    );`,
        'force-aware rebase confirmation',
    );

    const renderMarker = `export function renderBranchRecoveryUi() {\n    ensureStyles();\n    const host = hostForBanner();\n    const current = state();\n    const existing = globalThis.document?.getElementById?.(BANNER_ID);\n    if (!host || !branchRecoveryRequired(current)) {\n        existing?.remove?.();\n        return false;\n    }\n\n    const recovery = recoveryGroup();`;
    const renderReplacement = `function ensureForceControl(host) {\n    if (!host) return null;\n    let control = globalThis.document?.getElementById?.(FORCE_ID) || null;\n    if (!control) {\n        control = globalThis.document?.createElement?.('div');\n        if (!control) return null;\n        control.id = FORCE_ID;\n        control.className = 'npc-state-setting-row npc-state-v3-category-row npc-state-v3-force-rebase-row';\n    }\n    if (control.parentElement !== host) host.appendChild(control);\n    const renderKey = running ? '1' : '0';\n    if (control.dataset.renderKey !== renderKey) {\n        control.dataset.renderKey = renderKey;\n        control.dataset.running = running ? '1' : '0';\n        control.innerHTML = \`<span><b>Force timeline rebase</b><small>Rebuild the branch baseline around the currently visible chat even when NPC State considers it safe. Durable dossier canon is preserved.</small></span><button type="button" class="menu_button npc-state-v3-force-rebase-current" \${running ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i> \${running ? 'Rebasing...' : 'Force rebase to current chat'}</button>\`;\n        control.querySelector('.npc-state-v3-force-rebase-current')?.addEventListener('click', () => rebaseCurrentChat(true));\n    }\n    return control;\n}\n\nexport function renderBranchRecoveryUi() {\n    ensureStyles();\n    const host = hostForBanner();\n    const current = state();\n    const existing = globalThis.document?.getElementById?.(BANNER_ID);\n    const forceControl = globalThis.document?.getElementById?.(FORCE_ID) || null;\n    if (!host) {\n        existing?.remove?.();\n        forceControl?.remove?.();\n        return false;\n    }\n    if (!branchRecoveryRequired(current)) {\n        existing?.remove?.();\n        ensureForceControl(host);\n        return true;\n    }\n    forceControl?.remove?.();\n\n    const recovery = recoveryGroup();`;
    source = replaceRequired(source, renderMarker, renderReplacement, 'safe-state force control render');

    fs.writeFileSync(path, source);
}

console.log('Added NPC State 0.4.10 manual force-rebase control');
