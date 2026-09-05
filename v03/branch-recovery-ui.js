const PANEL_ID = 'npc_state_settings';
const BANNER_ID = 'npc_state_v3_branch_recovery';
const FORCE_ID = 'npc_state_v3_force_rebase';
let started = false;
let observer = null;
let scheduled = false;
let running = false;

function state() {
    try { return globalThis.NPCState?.getState?.() || null; }
    catch { return null; }
}

export function branchRecoveryRequired(value = state()) {
    return Boolean(value?.branchSafety && value.branchSafety.status !== 'safe');
}

function messageForKind(kind = '') {
    if (kind === 'prebaseline-truncation') return 'The chat was shortened beyond NPC State\'s oldest recoverable checkpoint.';
    if (kind === 'prebaseline-rewrite') return 'The chat was rewritten before NPC State\'s oldest recoverable checkpoint.';
    return 'The current chat is outside NPC State\'s oldest recoverable checkpoint.';
}

function ensureStyles() {
    if (globalThis.document?.getElementById?.('npc_state_v3_branch_recovery_style')) return;
    const style = globalThis.document?.createElement?.('style');
    if (!style) return;
    style.id = 'npc_state_v3_branch_recovery_style';
    style.textContent = `
#${BANNER_ID}{margin:0 0 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--SmartThemeQuoteColor,#d59a32) 58%,transparent);border-radius:10px;background:color-mix(in srgb,var(--SmartThemeQuoteColor,#d59a32) 9%,transparent);display:grid;gap:7px}
#${BANNER_ID} b{font-size:.95em}#${BANNER_ID} small{line-height:1.35;opacity:.82}#${BANNER_ID} .npc-state-v3-branch-recovery-actions{display:flex;gap:8px;flex-wrap:wrap}
#${BANNER_ID} button{margin:0}#${BANNER_ID}[data-running="1"] button{opacity:.65;pointer-events:none}
#${FORCE_ID} button{margin:0}#${FORCE_ID}[data-running="1"] button{opacity:.65;pointer-events:none}`;
    globalThis.document.head?.appendChild?.(style);
}

function recoveryGroup() {
    return globalThis.document?.getElementById?.('npc_state_v04_recovery_branch') || null;
}

function hostForBanner() {
    const panel = globalThis.document?.getElementById?.(PANEL_ID);
    const recovery = recoveryGroup();
    return recovery?.querySelector?.('.npc-state-v3-settings-group-body')
        || recovery
        || panel?.querySelector?.('.npc-state-drawer')
        || null;
}

function placeBanner(host, banner) {
    if (!host || !banner || banner.parentElement === host) return;
    host.prepend?.(banner);
}

async function rebaseCurrentChat(force = false) {
    if (running) return;
    const current = state();
    const required = branchRecoveryRequired(current);
    if (!required && force !== true) return render();
    const accepted = globalThis.confirm?.(
        (!required && force === true
            ? 'Force rebase NPC State to the current chat timeline even though branch safety is currently marked safe?\n\n'
            : 'Rebase NPC State to the current chat timeline?\n\n') +
        'This preserves durable profile canon, memories, portraits, manual locks, archives, social ties, deletion tombstones, and manual relationship edits. Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back before the new branch base is accepted. It then clears live in-chat state, chat-local message references, and incompatible branch checkpoints before scanning the latest surviving assistant exchange.\n\n' +
        'If this exact latest exchange was already scanned on the same lineage, NPC State preserves that scan marker so the refresh cannot apply its relationship delta twice. Older facts without recoverable timeline provenance may still remain until later scans revise them or you edit the dossier manually.'
    );
    if (!accepted) return;
    running = true;
    render();
    const toast = globalThis.toastr?.info?.('NPC State: rebasing to the current chat timeline...', '', { timeOut: 0, extendedTimeOut: 0 });
    try {
        const result = await globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true });
        if (!result?.ok) throw new Error(result?.reason || 'rebase failed');
        if (result.rescan?.ok) globalThis.toastr?.success?.('NPC State: timeline rebased and the latest surviving exchange was scanned.');
        else globalThis.toastr?.success?.('NPC State: timeline rebased. No surviving assistant exchange needed a scan.');
    } catch (error) {
        const rebasedState = state();
        if (rebasedState?.branchSafety?.status === 'safe') {
            console.warn('[NPC State v0.4.11] timeline rebase committed, but the follow-up scan failed', error);
            globalThis.toastr?.warning?.(`NPC State: timeline rebased successfully, but the latest exchange scan failed. Use Scan current cast to retry. ${error?.message || error}`);
        } else {
            console.error('[NPC State v0.4.11] timeline rebase failed safely', error);
            globalThis.toastr?.error?.(`NPC State: timeline rebase failed without replacing your durable dossiers. ${error?.message || error}`);
        }
    } finally {
        running = false;
        if (toast && globalThis.toastr?.clear) globalThis.toastr.clear(toast);
        render();
    }
}

function ensureForceControl(host) {
    if (!host) return null;
    let control = globalThis.document?.getElementById?.(FORCE_ID) || null;
    if (!control) {
        control = globalThis.document?.createElement?.('div');
        if (!control) return null;
        control.id = FORCE_ID;
        control.className = 'npc-state-setting-row npc-state-v3-category-row npc-state-v3-force-rebase-row';
    }
    if (control.parentElement !== host) host.appendChild(control);
    const renderKey = running ? '1' : '0';
    if (control.dataset.renderKey !== renderKey) {
        control.dataset.renderKey = renderKey;
        control.dataset.running = running ? '1' : '0';
        control.innerHTML = `<span><b>Force timeline rebase</b><small>Rebuild the branch baseline around the currently visible chat even when NPC State considers it safe. Durable dossier canon is preserved.</small></span><button type="button" class="menu_button npc-state-v3-force-rebase-current" ${running ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i> ${running ? 'Rebasing...' : 'Force rebase to current chat'}</button>`;
        control.querySelector('.npc-state-v3-force-rebase-current')?.addEventListener('click', () => rebaseCurrentChat(true));
    }
    return control;
}

export function renderBranchRecoveryUi() {
    ensureStyles();
    const host = hostForBanner();
    const current = state();
    const existing = globalThis.document?.getElementById?.(BANNER_ID);
    const forceControl = globalThis.document?.getElementById?.(FORCE_ID) || null;
    if (!host) {
        existing?.remove?.();
        forceControl?.remove?.();
        return false;
    }
    if (!branchRecoveryRequired(current)) {
        existing?.remove?.();
        ensureForceControl(host);
        return true;
    }
    forceControl?.remove?.();

    const recovery = recoveryGroup();
    if (recovery && 'open' in recovery) recovery.open = true;

    const kind = String(current.branchSafety?.kind || '');
    let banner = existing;
    if (!banner) {
        banner = globalThis.document.createElement('div');
        banner.id = BANNER_ID;
    }
    placeBanner(host, banner);

    const renderKey = `${kind}|${running ? '1' : '0'}`;
    if (banner.dataset.renderKey !== renderKey) {
        banner.dataset.renderKey = renderKey;
        banner.dataset.running = running ? '1' : '0';
        banner.innerHTML = `<b>Timeline rebase required</b><small>${messageForKind(kind)} Durable dossiers are intact. Rebase only if the remaining chat is now the canon you want to keep.</small><div class="npc-state-v3-branch-recovery-actions"><button type="button" class="menu_button npc-state-v3-rebase-current"><i class="fa-solid fa-code-branch"></i> ${running ? 'Rebasing...' : 'Rebase to current chat'}</button></div>`;
        banner.querySelector('.npc-state-v3-rebase-current')?.addEventListener('click', rebaseCurrentChat);
    }
    return true;
}

function render() { return renderBranchRecoveryUi(); }

function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
    schedule(() => { scheduled = false; render(); });
}

function touchesPanel(records = []) {
    const panel = globalThis.document?.getElementById?.(PANEL_ID);
    for (const record of records) {
        if (panel && (record.target === panel || panel.contains?.(record.target))) return true;
        for (const node of record.addedNodes || []) if (node?.id === PANEL_ID || node?.querySelector?.(`#${PANEL_ID}`)) return true;
    }
    return false;
}

export function startBranchRecoveryUi() {
    if (started || !globalThis.document?.addEventListener) return false;
    started = true;
    scheduleRender();
    if (typeof globalThis.MutationObserver === 'function' && globalThis.document.body) {
        observer = new globalThis.MutationObserver(records => { if (touchesPanel(records)) scheduleRender(); });
        observer.observe(globalThis.document.body, { childList: true, subtree: true });
    }
    return true;
}

export function stopBranchRecoveryUi() {
    observer?.disconnect?.();
    observer = null;
    started = false;
    scheduled = false;
    return true;
}
