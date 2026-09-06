import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing 0.4.29 recovery UI marker: ' + label);
    return source.replace(from, to);
}

const path = 'v03/branch-recovery-ui.js';
let source = fs.readFileSync(path, 'utf8');

source = replaceRequired(source,
    `const RECOVERY_REBUILD_UI_VERSION = 1;`,
    `const RECOVERY_REBUILD_UI_VERSION = 2;`,
    'UI version');

source = replaceRequired(source,
`function recoveryRangeDefaults() {
    try {
        return globalThis.NPCState?.recoveryRange?.() || { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    } catch {
        return { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    }
}`,
`function recoveryRangeDefaults(options = undefined) {
    try {
        return globalThis.NPCState?.recoveryRange?.(options) || { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    } catch (error) {
        if (options) throw error;
        return { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    }
}`,
    'range preview API');

source = replaceRequired(source,
`function recoveryStatusText(info) {
    if (!info) return '';
    const done = Math.max(0, Number(info.completed) || 0);
    const total = Math.max(0, Number(info.total) || 0);
    const next = Number.isInteger(info.nextMessageId) ? ' · next #' + info.nextMessageId : '';
    const mode = info.relationshipMode === 're-evaluate' ? 're-evaluate relationships' : 'fresh relationship meters';
    return String(info.status || 'paused') + ' · ' + done + '/' + total + ' exchanges · ' + mode + next;
}`,
`function recoveryStatusText(info) {
    if (!info) return '';
    const done = Math.max(0, Number(info.completed) || 0);
    const total = Math.max(0, Number(info.total) || 0);
    const next = Number.isInteger(info.nextMessageId) ? ' · next #' + info.nextMessageId : '';
    const mode = info.relationshipMode === 're-evaluate' ? 're-evaluate relationships' : 'fresh relationship meters';
    const ownership = info.activeElsewhere ? ' · active in another tab' : (info.abandoned ? ' · lease expired; resumable' : '');
    return String(info.status || 'paused') + ' · ' + done + '/' + total + ' exchanges · ' + mode + next + ownership;
}`,
    'ownership status text');

source = replaceRequired(source,
`function recoveryConfirmText({ freshOnly = false, healthy = false, relationshipMode = 'fresh' } = {}) {`,
`function recoveryConfirmText({ freshOnly = false, healthy = false, relationshipMode = 'fresh', exchangeCount = null } = {}) {`,
    'confirmation count argument');
source = replaceRequired(source,
`    return replacement + '\\n\\nHistorical scans run oldest to newest and each scan sees only chat content up to that exchange. ' + relationship;`,
`    const selected = Number.isInteger(exchangeCount) ? '\\n\\nSelected assistant exchanges: ' + exchangeCount + '.' : '';\n    return replacement + selected + '\\n\\nHistorical scans run oldest to newest and each scan sees only chat content up to that exchange. ' + relationship;`,
    'confirmation count text');

source = replaceRequired(source,
`    return { range, relationshipMode, startMessageId, endMessageId, defaults };`,
`    const selection = recoveryRangeDefaults({ startMessageId, endMessageId });\n    return { range, relationshipMode, startMessageId, endMessageId, defaults, selection };`,
    'selected range validation and count');

source = replaceRequired(source,
`    if (!globalThis.confirm?.(recoveryConfirmText({ healthy, relationshipMode: options.relationshipMode }))) return;`,
`    if (!globalThis.confirm?.(recoveryConfirmText({ healthy, relationshipMode: options.relationshipMode, exchangeCount: Number(options.selection?.assistantExchangeCount || 0) }))) return;`,
    'start confirmation selected count');

source = replaceRequired(source,
`function bindRecoveryControl(control) {
    control.querySelector('.npc-state-v0428-fresh')?.addEventListener('click', initializeFreshFromUi);
    control.querySelector('.npc-state-v0428-start-rebuild')?.addEventListener('click', () => startRecoveryFromUi(control));
    control.querySelector('.npc-state-v0428-resume')?.addEventListener('click', resumeRecoveryFromUi);
    control.querySelector('.npc-state-v0428-pause')?.addEventListener('click', pauseRecoveryFromUi);
    control.querySelector('.npc-state-v0428-cancel')?.addEventListener('click', cancelRecoveryFromUi);
    const range = control.querySelector('.npc-state-v0428-range');
    const updateCustom = () => {
        const custom = range?.value === 'custom';
        for (const node of control.querySelectorAll('.npc-state-v0428-custom-range')) node.style.display = custom ? 'grid' : 'none';
    };
    range?.addEventListener('change', updateCustom);
    updateCustom();
}`,
`function bindRecoveryControl(control) {
    control.querySelector('.npc-state-v0428-fresh')?.addEventListener('click', initializeFreshFromUi);
    control.querySelector('.npc-state-v0428-start-rebuild')?.addEventListener('click', () => startRecoveryFromUi(control));
    control.querySelector('.npc-state-v0428-resume')?.addEventListener('click', resumeRecoveryFromUi);
    control.querySelector('.npc-state-v0428-pause')?.addEventListener('click', pauseRecoveryFromUi);
    control.querySelector('.npc-state-v0428-cancel')?.addEventListener('click', cancelRecoveryFromUi);
    const range = control.querySelector('.npc-state-v0428-range');
    const start = control.querySelector('.npc-state-v0428-start');
    const end = control.querySelector('.npc-state-v0428-end');
    const preview = control.querySelector('.npc-state-v0429-selected-count');
    const updateSelection = () => {
        const custom = range?.value === 'custom';
        for (const node of control.querySelectorAll('.npc-state-v0428-custom-range')) node.style.display = custom ? 'grid' : 'none';
        if (!preview) return;
        try {
            const selected = selectedRecoveryOptions(control);
            preview.textContent = 'Selected assistant exchanges: ' + Number(selected.selection?.assistantExchangeCount || 0) + '.';
        } catch (error) {
            preview.textContent = 'Selected range invalid: ' + String(error?.message || error);
        }
    };
    range?.addEventListener('change', updateSelection);
    start?.addEventListener('input', updateSelection);
    end?.addEventListener('input', updateSelection);
    updateSelection();
}`,
    'live selected exchange preview');

source = replaceRequired(source,
`    const activelyRunning = recoveryRunning() || info?.status === 'running' || running;
    const defaults = recoveryRangeDefaults();
    const key = [hydrationInfo?.status || '', missing ? 'missing' : '', info?.status || '', info?.completed || 0, info?.total || 0, info?.nextMessageId ?? '', activelyRunning ? 1 : 0].join('|');`,
`    const activeElsewhere = info?.activeElsewhere === true;\n    const activelyRunning = recoveryRunning() || info?.status === 'running' || running;\n    const defaults = recoveryRangeDefaults();\n    const key = [hydrationInfo?.status || '', missing ? 'missing' : '', info?.status || '', info?.completed || 0, info?.total || 0, info?.nextMessageId ?? '', activelyRunning ? 1 : 0, activeElsewhere ? 1 : 0].join('|');`,
    'active other tab render state');

source = replaceRequired(source,
`    const showResume = ['paused', 'failed'].includes(String(info?.status || ''));
    const showStop = ['running', 'paused', 'failed'].includes(String(info?.status || '')) || recoveryRunning();`,
`    const showResume = !activeElsewhere && ['paused', 'failed'].includes(String(info?.status || ''));\n    const showStop = !activeElsewhere && (['running', 'paused', 'failed'].includes(String(info?.status || '')) || recoveryRunning());`,
    'other tab action suppression');

source = replaceRequired(source,
`        + (restartRequired ? '<small><b>Restart required:</b> completed chat history changed. NPC State will not replay completed recovery work against a different past automatically.</small>' : '')
        + '<div class="npc-state-v0428-start-controls">'`,
`        + (restartRequired ? '<small><b>Restart required:</b> completed chat history changed. NPC State will not replay completed recovery work against a different past automatically.</small>' : '')\n        + (activeElsewhere ? '<small><b>Another tab owns this recovery.</b> This tab is read-only until that session finishes, pauses, cancels, or its lease expires.</small>' : '')\n        + '<div class="npc-state-v0428-start-controls">'`,
    'other tab observer message');

source = replaceRequired(source,
`        + '</div></div>'
        + '<div class="npc-state-v0428-recovery-actions">'`,
`        + '</div><small class="npc-state-v0429-selected-count"></small></div>'\n        + '<div class="npc-state-v0428-recovery-actions">'`,
    'selected count preview surface');

fs.writeFileSync(path, source);
console.log('Applied NPC State 0.4.29 recovery ownership and strict-range UI');
