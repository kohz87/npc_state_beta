import fs from 'node:fs';

const path = 'v03/branch-recovery-ui.js';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label) {
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Missing v0.4.28 recovery UI marker: ' + label);
    source = source.replace(from, to);
}

if (!source.includes('RECOVERY_REBUILD_UI_VERSION')) {
    replaceRequired(
        `const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';`,
        `const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';
const RECOVERY_REBUILD_UI_VERSION = 1;
const REBUILD_ID = 'npc_state_v0428_recovery_rebuild';
const REBUILD_STYLE_ID = 'npc_state_v0428_recovery_rebuild_style';`,
        'recovery UI constants',
    );

    const helpers = String.raw`
function hydration() {
    try { return globalThis.NPCState?.hydrationStatus?.() || { status: 'unloaded', error: null }; }
    catch { return { status: 'error', error: null }; }
}

function recovery() {
    try { return globalThis.NPCState?.recoveryStatus?.() || state()?.recovery || null; }
    catch { return state()?.recovery || null; }
}

function recoveryRunning() {
    try { return globalThis.NPCState?.isRecoveryRunning?.() === true; }
    catch { return false; }
}

function missingSidecarHydration() {
    const info = hydration();
    const error = info?.error;
    return info?.status === 'error' && (
        String(error?.code || '') === 'NPC_STATE_V04_BETA_MISSING_SIDECAR'
        || /sidecar pointer exists but the file is missing/i.test(String(error?.message || error || ''))
    );
}

function ensureRecoveryStyles() {
    if (globalThis.document?.getElementById?.(REBUILD_STYLE_ID)) return;
    const style = globalThis.document?.createElement?.('style');
    if (!style) return;
    style.id = REBUILD_STYLE_ID;
    style.textContent = '#'+REBUILD_ID+'{margin:0 0 10px;padding:11px 12px;border:1px solid color-mix(in srgb,var(--SmartThemeBorderColor,#777) 55%,transparent);border-radius:10px;display:grid;gap:9px;background:color-mix(in srgb,var(--SmartThemeBlurTintColor,#222) 75%,transparent)}'
        +'#'+REBUILD_ID+' .npc-state-v0428-recovery-head{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}'
        +'#'+REBUILD_ID+' .npc-state-v0428-recovery-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}'
        +'#'+REBUILD_ID+' label{display:grid;gap:4px;font-size:.9em}'
        +'#'+REBUILD_ID+' select,#'+REBUILD_ID+' input{width:100%;box-sizing:border-box}'
        +'#'+REBUILD_ID+' .npc-state-v0428-recovery-actions{display:flex;gap:8px;flex-wrap:wrap}'
        +'#'+REBUILD_ID+' small{line-height:1.38;opacity:.84}'
        +'#'+REBUILD_ID+' progress{width:100%;height:12px}'
        +'#'+REBUILD_ID+'[data-running="1"] .npc-state-v0428-start-controls{opacity:.62}'
        +'@media(max-width:720px){#'+REBUILD_ID+' .npc-state-v0428-recovery-grid{grid-template-columns:1fr}}';
    globalThis.document.head?.appendChild?.(style);
}

function recoveryRangeDefaults() {
    try {
        return globalThis.NPCState?.recoveryRange?.() || { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    } catch {
        return { firstAssistantMessageId: null, latestAssistantMessageId: null, assistantExchangeCount: 0 };
    }
}

function recoveryStatusText(info) {
    if (!info) return '';
    const done = Math.max(0, Number(info.completed) || 0);
    const total = Math.max(0, Number(info.total) || 0);
    const next = Number.isInteger(info.nextMessageId) ? ' · next #' + info.nextMessageId : '';
    const mode = info.relationshipMode === 're-evaluate' ? 're-evaluate relationships' : 'fresh relationship meters';
    return String(info.status || 'paused') + ' · ' + done + '/' + total + ' exchanges · ' + mode + next;
}

function recoveryConfirmText({ freshOnly = false, healthy = false, relationshipMode = 'fresh' } = {}) {
    const replacement = healthy
        ? 'This chat currently has a readable NPC State sidecar. Recovery will create a NEW replacement file and switch this chat pointer only after the replacement upload succeeds. The old file is left untouched as a safety copy.'
        : 'The configured NPC State sidecar is missing. Recovery will create a NEW file and switch this chat pointer only after the new upload succeeds.';
    if (freshOnly) return replacement + '\n\nThis starts with an empty NPC State database and does not scan chat history.';
    const relationship = relationshipMode === 're-evaluate'
        ? 'Relationship history will be re-evaluated chronologically through the normal evidence, cap, inertia, duplicate and milestone rules.'
        : 'Relationship meters will start fresh at zero while the rest of NPC history is reconstructed.';
    return replacement + '\n\nHistorical scans run oldest to newest and each scan sees only chat content up to that exchange. ' + relationship;
}

async function initializeFreshFromUi() {
    if (running || recoveryRunning()) return;
    const healthy = !missingSidecarHydration() && hydration()?.status === 'ready';
    if (!globalThis.confirm?.(recoveryConfirmText({ freshOnly: true, healthy }))) return;
    running = true;
    render();
    try {
        const result = await globalThis.NPCState?.initializeFresh?.({ allowExisting: healthy });
        if (!result?.ok) throw new Error(result?.reason || 'fresh initialization failed');
        globalThis.toastr?.success?.('NPC State: fresh recovery sidecar initialized.');
    } catch (error) {
        console.error('[NPC State v0.4.28] fresh recovery initialization failed safely', error);
        globalThis.toastr?.error?.('NPC State: fresh initialization failed without guessing a replacement pointer. ' + (error?.message || error));
    } finally {
        running = false;
        render();
    }
}

function selectedRecoveryOptions(control) {
    const defaults = recoveryRangeDefaults();
    const range = String(control?.querySelector?.('.npc-state-v0428-range')?.value || 'all');
    const relationshipMode = String(control?.querySelector?.('.npc-state-v0428-relationship')?.value || 'fresh');
    let startMessageId = null;
    let endMessageId = null;
    if (range === 'latest') {
        startMessageId = defaults.latestAssistantMessageId;
        endMessageId = defaults.latestAssistantMessageId;
    } else if (range === 'custom') {
        const rawStart = Number(control?.querySelector?.('.npc-state-v0428-start')?.value);
        const rawEnd = Number(control?.querySelector?.('.npc-state-v0428-end')?.value);
        if (!Number.isInteger(rawStart) || rawStart < 0 || !Number.isInteger(rawEnd) || rawEnd < rawStart) {
            throw new Error('Custom recovery range requires integer message IDs with end >= start.');
        }
        startMessageId = rawStart;
        endMessageId = rawEnd;
    }
    return { range, relationshipMode, startMessageId, endMessageId, defaults };
}

async function startRecoveryFromUi(control) {
    if (running || recoveryRunning()) return;
    let options;
    try { options = selectedRecoveryOptions(control); }
    catch (error) { globalThis.toastr?.warning?.('NPC State: ' + (error?.message || error)); return; }
    const healthy = !missingSidecarHydration() && hydration()?.status === 'ready';
    if (!globalThis.confirm?.(recoveryConfirmText({ healthy, relationshipMode: options.relationshipMode }))) return;
    running = true;
    render();
    try {
        const result = await globalThis.NPCState?.rebuildFromChat?.({
            startMessageId: options.startMessageId,
            endMessageId: options.endMessageId,
            relationshipMode: options.relationshipMode,
            allowExisting: healthy,
        });
        if (!result?.ok) throw new Error(result?.reason || result?.recovery?.error || 'historical recovery failed');
        if (result.complete) globalThis.toastr?.success?.('NPC State: historical reconstruction complete.');
    } catch (error) {
        console.error('[NPC State v0.4.28] historical rebuild failed safely', error);
        globalThis.toastr?.error?.('NPC State: historical reconstruction stopped safely. Resume retries from the last committed exchange. ' + (error?.message || error));
    } finally {
        running = false;
        render();
    }
}

async function resumeRecoveryFromUi() {
    if (running || recoveryRunning()) return;
    running = true;
    render();
    try {
        const result = await globalThis.NPCState?.resumeRebuild?.();
        if (!result?.ok) throw new Error(result?.reason || result?.recovery?.error || 'resume failed');
        if (result.complete) globalThis.toastr?.success?.('NPC State: historical reconstruction complete.');
    } catch (error) {
        console.error('[NPC State v0.4.28] recovery resume failed safely', error);
        globalThis.toastr?.error?.('NPC State: recovery resume stopped safely. ' + (error?.message || error));
    } finally {
        running = false;
        render();
    }
}

async function pauseRecoveryFromUi() {
    try {
        const result = await globalThis.NPCState?.pauseRebuild?.('Paused by player after the last committed exchange.');
        if (!result?.ok) throw new Error(result?.reason || 'pause failed');
        globalThis.toastr?.info?.('NPC State: recovery pause requested. The current model call, if any, may finish but no later exchange will start.');
    } catch (error) {
        globalThis.toastr?.error?.('NPC State: could not pause recovery. ' + (error?.message || error));
    }
    render();
}

async function cancelRecoveryFromUi() {
    if (!globalThis.confirm?.('Cancel historical reconstruction?\n\nAlready committed reconstructed exchanges remain in the replacement sidecar. The current uncommitted model result will be discarded if cancellation arrives while it is running. Start a new rebuild to reconstruct from scratch.')) return;
    try {
        const result = await globalThis.NPCState?.cancelRebuild?.();
        if (!result?.ok) throw new Error(result?.reason || 'cancel failed');
        globalThis.toastr?.info?.('NPC State: recovery cancellation requested.');
    } catch (error) {
        globalThis.toastr?.error?.('NPC State: could not cancel recovery. ' + (error?.message || error));
    }
    render();
}

function bindRecoveryControl(control) {
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
}

function ensureRecoveryControl(host) {
    ensureRecoveryStyles();
    if (!host) return null;
    let control = globalThis.document?.getElementById?.(REBUILD_ID) || null;
    if (!control) {
        control = globalThis.document?.createElement?.('div');
        if (!control) return null;
        control.id = REBUILD_ID;
    }
    if (control.parentElement !== host) host.prepend?.(control);

    const info = recovery();
    const hydrationInfo = hydration();
    const missing = missingSidecarHydration();
    const activelyRunning = recoveryRunning() || info?.status === 'running' || running;
    const defaults = recoveryRangeDefaults();
    const key = [hydrationInfo?.status || '', missing ? 'missing' : '', info?.status || '', info?.completed || 0, info?.total || 0, info?.nextMessageId ?? '', activelyRunning ? 1 : 0].join('|');
    if (control.dataset.renderKey === key) return control;
    control.dataset.renderKey = key;
    control.dataset.running = activelyRunning ? '1' : '0';

    const status = info ? recoveryStatusText(info) : (missing ? 'missing sidecar · explicit recovery available' : 'no active reconstruction');
    const explanation = missing
        ? 'The saved pointer exists but its beta sidecar file is gone. NPC State will not invent a blank replacement automatically. Create a fresh database or reconstruct from the surviving chat.'
        : 'Rebuild creates a new sidecar, then reconstructs selected assistant exchanges oldest to newest. Completed progress is persisted after every exchange.';
    const progressMax = Math.max(1, Number(info?.total) || 1);
    const progressValue = Math.max(0, Math.min(progressMax, Number(info?.completed) || 0));
    const showResume = ['paused', 'failed'].includes(String(info?.status || ''));
    const showStop = ['running', 'paused', 'failed'].includes(String(info?.status || '')) || recoveryRunning();
    const restartRequired = info?.status === 'stale';
    const first = defaults.firstAssistantMessageId ?? '';
    const latest = defaults.latestAssistantMessageId ?? '';
    const disabledStart = activelyRunning ? ' disabled' : '';

    control.innerHTML = '<div class="npc-state-v0428-recovery-head"><b>Recovery & historical rebuild</b><small>' + status + '</small></div>'
        + '<small>' + explanation + '</small>'
        + (info ? '<progress max="' + progressMax + '" value="' + progressValue + '"></progress>' : '')
        + (info?.reason ? '<small><b>Status:</b> ' + String(info.reason).replace(/[<>]/g, '') + '</small>' : '')
        + (info?.error ? '<small><b>Last error:</b> ' + String(info.error).replace(/[<>]/g, '') + '</small>' : '')
        + (restartRequired ? '<small><b>Restart required:</b> completed chat history changed. NPC State will not replay completed recovery work against a different past automatically.</small>' : '')
        + '<div class="npc-state-v0428-start-controls">'
        + '<div class="npc-state-v0428-recovery-grid">'
        + '<label>Range<select class="text_pole npc-state-v0428-range"'+disabledStart+'><option value="all">All surviving exchanges</option><option value="latest">Latest exchange only</option><option value="custom">Custom message IDs</option></select></label>'
        + '<label>Relationship recovery<select class="text_pole npc-state-v0428-relationship"'+disabledStart+'><option value="fresh">Start meters fresh</option><option value="re-evaluate">Re-evaluate history</option></select></label>'
        + '<label class="npc-state-v0428-custom-range" style="display:none">Start message ID<input class="text_pole npc-state-v0428-start" type="number" min="0" value="'+first+'"'+disabledStart+'></label>'
        + '<label class="npc-state-v0428-custom-range" style="display:none">End message ID<input class="text_pole npc-state-v0428-end" type="number" min="0" value="'+latest+'"'+disabledStart+'></label>'
        + '</div></div>'
        + '<div class="npc-state-v0428-recovery-actions">'
        + '<button type="button" class="menu_button npc-state-v0428-fresh"'+disabledStart+'><i class="fa-solid fa-file-circle-plus"></i> Fresh database</button>'
        + '<button type="button" class="menu_button npc-state-v0428-start-rebuild"'+disabledStart+'><i class="fa-solid fa-clock-rotate-left"></i> Rebuild from chat</button>'
        + (showResume && !activelyRunning ? '<button type="button" class="menu_button npc-state-v0428-resume"><i class="fa-solid fa-play"></i> Resume</button>' : '')
        + (showStop && activelyRunning ? '<button type="button" class="menu_button npc-state-v0428-pause"><i class="fa-solid fa-pause"></i> Pause</button>' : '')
        + (showStop ? '<button type="button" class="menu_button npc-state-v0428-cancel"><i class="fa-solid fa-ban"></i> Cancel</button>' : '')
        + '</div>'
        + '<small>Available assistant exchanges: ' + Number(defaults.assistantExchangeCount || 0) + (latest === '' ? '' : ' · latest message #' + latest) + '. Historical reconstruction uses roughly one model call per processed assistant exchange, plus malformed-JSON retries.</small>';
    bindRecoveryControl(control);
    return control;
}

`;

    replaceRequired(
        `export function renderBranchRecoveryUi() {`,
        helpers + `export function renderBranchRecoveryUi() {`,
        'recovery helper insertion',
    );

    replaceRequired(
        `    const current = state();
    const existing = globalThis.document?.getElementById?.(BANNER_ID);`,
        `    const current = state();
    ensureRecoveryControl(host);
    const existing = globalThis.document?.getElementById?.(BANNER_ID);`,
        'recovery control render hook',
    );
}

fs.writeFileSync(path, source);
console.log('Applied NPC State 0.4.28 recovery rebuild interface');
