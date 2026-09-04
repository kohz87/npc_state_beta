import fs from 'node:fs';

const path = 'v03/branch-recovery-ui.js';
let source = fs.readFileSync(path, 'utf8');

const oldHost = `function hostForBanner() {
    const panel = globalThis.document?.getElementById?.(PANEL_ID);
    return panel?.querySelector?.('.npc-state-v3-tracking-section') || panel?.querySelector?.('.npc-state-drawer') || null;
}

function placeBanner(host, banner) {
    if (!host || !banner || banner.parentElement === host) return;
    const heading = host.querySelector?.('.npc-state-v3-settings-card-title');
    if (heading?.nextSibling) host.insertBefore(banner, heading.nextSibling);
    else host.prepend?.(banner);
}`;

const newHost = `function recoveryGroup() {
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
}`;

if (!source.includes(oldHost)) throw new Error('Missing legacy branch recovery host placement');
source = source.replace(oldHost, newHost);

const oldRenderStart = `    const kind = String(current.branchSafety?.kind || '');
    let banner = existing;`;
const newRenderStart = `    const recovery = recoveryGroup();
    if (recovery && 'open' in recovery) recovery.open = true;

    const kind = String(current.branchSafety?.kind || '');
    let banner = existing;`;
if (!source.includes(oldRenderStart)) throw new Error('Missing branch recovery render insertion point');
source = source.replace(oldRenderStart, newRenderStart);

fs.writeFileSync(path, source);
console.log('Fixed NPC State 0.4.6 branch recovery control mounting');