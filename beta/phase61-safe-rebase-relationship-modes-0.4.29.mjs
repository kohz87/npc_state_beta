import fs from 'node:fs';

const MARKER = 'PHASE61_SAFE_REBASE_RELATIONSHIP_MODES';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, source) { fs.writeFileSync(path, source); }
function replaceOnce(source, before, after, label) {
    if (source.includes(after)) return source;
    const index = source.indexOf(before);
    if (index < 0) throw new Error('Missing phase61 anchor: ' + label);
    if (source.indexOf(before, index + before.length) >= 0) throw new Error('Ambiguous phase61 anchor: ' + label);
    return source.slice(0, index) + after + source.slice(index + before.length);
}
function replaceRegexOnce(source, pattern, replacement, label) {
    if (source.includes(replacement)) return source;
    const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))];
    if (matches.length !== 1) throw new Error('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);
    return source.replace(pattern, replacement);
}

// Schema: retain pre-rebase provenance as inert audit metadata and keep one restorable pre-rebase snapshot.
{
    const path = 'v03/schema.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        source = replaceOnce(source,
`function text(value, max = 1200) {
    return String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
}
`,
`function text(value, max = 1200) {
    return String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, max);
}

// ${MARKER}: accepted pre-rebase records remain inspectable but cannot claim current-timeline provenance.
function normalizeRebaseRelationshipAudit(raw = {}) {
    const status = String(raw?.timelineStatus || '').trim().toLocaleLowerCase();
    return {
        timelineStatus: status === 'accepted-pre-rebase' ? 'accepted-pre-rebase' : 'current',
        originalSourceMessageId: Number.isInteger(raw?.originalSourceMessageId) ? raw.originalSourceMessageId : null,
        originalSourceEventKey: text(raw?.originalSourceEventKey, 240),
        rebasedAt: Number(raw?.rebasedAt) || null,
    };
}
`, 'schema audit helper');

        source = replaceOnce(source,
`return source.slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT * 2).map(raw => ({
        delta:`,
`return source.slice(-RELATIONSHIP_EVIDENCE_HISTORY_LIMIT * 2).map(raw => ({
        ...normalizeRebaseRelationshipAudit(raw),
        delta:`, 'relationship evidence audit metadata');

        source = replaceOnce(source,
`return (Array.isArray(value) ? value : []).slice(-12).map(raw => ({
        impact:`,
`return (Array.isArray(value) ? value : []).slice(-12).map(raw => ({
        ...normalizeRebaseRelationshipAudit(raw),
        impact:`, 'relationship diagnostic audit metadata');

        source = replaceOnce(source,
`const relationshipHistory = Array.isArray(input.relationshipHistory) ? input.relationshipHistory.slice(-24).map(item => ({
        impact:`,
`const relationshipHistory = Array.isArray(input.relationshipHistory) ? input.relationshipHistory.slice(-24).map(item => ({
        ...normalizeRebaseRelationshipAudit(item),
        impact:`, 'relationship history audit metadata');

        source = replaceOnce(source,
`        const entry = {
            axis,
            polarity,
            threshold,
            reason: text(raw.reason, 300) || 'Relationship milestone established.',`,
`        const entry = {
            ...normalizeRebaseRelationshipAudit(raw),
            axis,
            polarity,
            threshold,
            reason: text(raw.reason, 300) || 'Relationship milestone established.',`, 'relationship milestone audit metadata');

        source = replaceOnce(source,
`        lastRelationshipChange: input.lastRelationshipChange ? {
            ...emptyRelationshipChange(),`,
`        lastRelationshipChange: input.lastRelationshipChange ? {
            ...emptyRelationshipChange(),
            ...normalizeRebaseRelationshipAudit(input.lastRelationshipChange),`, 'last relationship change audit metadata');

        source = replaceOnce(source,
`        recovery: null,
        createdAt: Date.now(),`,
`        recovery: null,
        rebaseBackup: null,
        createdAt: Date.now(),`, 'empty state rebase backup');

        source = replaceOnce(source,
`    const rawSafety = input.branchSafety && typeof input.branchSafety === 'object' ? input.branchSafety : {};`,
`    const rawRebaseBackup = input.rebaseBackup && typeof input.rebaseBackup === 'object' && !Array.isArray(input.rebaseBackup) ? input.rebaseBackup : null;
    const rebaseBackup = rawRebaseBackup?.snapshot && typeof rawRebaseBackup.snapshot === 'object'
        ? {
            createdAt: Number(rawRebaseBackup.createdAt) || Date.now(),
            relationshipMode: ['preserve', 'rollback'].includes(String(rawRebaseBackup.relationshipMode || '')) ? String(rawRebaseBackup.relationshipMode) : 'preserve',
            divergenceMessageId: Number.isInteger(rawRebaseBackup.divergenceMessageId) ? rawRebaseBackup.divergenceMessageId : null,
            sourceLastScannedMessageId: Number.isInteger(rawRebaseBackup.sourceLastScannedMessageId) ? rawRebaseBackup.sourceLastScannedMessageId : null,
            sourceLineage: Array.isArray(rawRebaseBackup.sourceLineage) ? rawRebaseBackup.sourceLineage.map(value => String(value || '')).filter(Boolean) : [],
            snapshot: structuredClone(rawRebaseBackup.snapshot),
        }
        : null;
    const rawSafety = input.branchSafety && typeof input.branchSafety === 'object' ? input.branchSafety : {};`, 'normalize rebase backup');

        source = replaceOnce(source,
`        recovery: normalizeRecoveryState(input.recovery),
        createdAt: Number(input.createdAt) || Date.now(),`,
`        recovery: normalizeRecoveryState(input.recovery),
        rebaseBackup,
        createdAt: Number(input.createdAt) || Date.now(),`, 'return rebase backup');

        source = replaceOnce(source,
`    copy.recovery = null;
    // Portrait binary/data URLs`,
`    copy.recovery = null;
    copy.rebaseBackup = null;
    // Portrait binary/data URLs`, 'checkpoint backup recursion guard');
        write(path, source);
    }
}

// Branch core: preservation is the safe default; rollback is explicit and previewable.
{
    const path = 'v03/branches.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        const replacement = `export function normalizeRebaseRelationshipMode(value = 'preserve') {
    const mode = String(value ?? 'preserve').trim().toLocaleLowerCase() || 'preserve';
    if (mode !== 'preserve' && mode !== 'rollback') {
        const error = new Error('Relationship rebase mode must be preserve or rollback.');
        error.code = 'NPC_STATE_V04_BETA_REBASE_RELATIONSHIP_MODE';
        throw error;
    }
    return mode;
}

// ${MARKER}: old message ids/event keys are retained only in original* audit fields.
function quarantineRebasedRelationshipAudit(entry, rebasedAt) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const originalSourceMessageId = Number.isInteger(entry.originalSourceMessageId)
        ? entry.originalSourceMessageId
        : (Number.isInteger(entry.sourceMessageId) ? entry.sourceMessageId : null);
    const originalSourceEventKey = String(entry.originalSourceEventKey || entry.sourceEventKey || '').slice(0, 240);
    const next = {
        ...entry,
        sourceMessageId: null,
        turn: null,
        timelineStatus: 'accepted-pre-rebase',
        originalSourceMessageId,
        rebasedAt,
    };
    if (Object.prototype.hasOwnProperty.call(entry, 'sourceEventKey') || originalSourceEventKey) {
        next.originalSourceEventKey = originalSourceEventKey;
        next.sourceEventKey = '';
    }
    return next;
}

export function previewRelationshipRebase(state, chat = [], { relationshipMode = 'rollback' } = {}) {
    const mode = normalizeRebaseRelationshipMode(relationshipMode);
    const source = normalizeState(state, state?.chatKey || '');
    const divergenceMessageId = branchDivergenceMessageId(source, chat);
    if (mode === 'preserve') return { relationshipMode: mode, divergenceMessageId, affectedNpcs: [] };
    const affectedNpcs = [];
    for (const npc of source.npcs || []) {
        const rolled = rollbackRebasedRelationship(npc, divergenceMessageId);
        const axes = RELATIONSHIP_AXES.filter(axis => Number(npc.relationship?.[axis] || 0) !== Number(rolled.relationship?.[axis] || 0));
        const historyRemoved = Math.max(0, (npc.relationshipHistory || []).length - (rolled.relationshipHistory || []).length);
        const milestonesRemoved = Math.max(0, (npc.relationshipMilestones || []).length - (rolled.relationshipMilestones || []).length);
        const evidenceRemoved = Math.max(0, (npc.relationshipEvidenceHistory || []).length - (rolled.relationshipEvidenceHistory || []).length);
        const diagnosticsRemoved = Math.max(0, (npc.relationshipDiagnostics || []).length - (rolled.relationshipDiagnostics || []).length);
        const summaryCleared = Boolean(npc.relationshipSummary) && !rolled.relationshipSummary;
        if (!axes.length && !historyRemoved && !milestonesRemoved && !evidenceRemoved && !diagnosticsRemoved && !summaryCleared) continue;
        affectedNpcs.push({
            npcId: npc.id,
            name: npc.name,
            before: structuredClone(npc.relationship),
            after: structuredClone(rolled.relationship),
            progressBefore: structuredClone(npc.relationshipProgress),
            progressAfter: structuredClone(rolled.relationshipProgress),
            axes,
            historyRemoved,
            milestonesRemoved,
            evidenceRemoved,
            diagnosticsRemoved,
            summaryCleared,
        });
    }
    return { relationshipMode: mode, divergenceMessageId, affectedNpcs };
}

export function rebaseToCurrentChat(state, chat = [], { relationshipMode = 'preserve' } = {}) {
    const mode = normalizeRebaseRelationshipMode(relationshipMode);
    const source = normalizeState(state, state?.chatKey || '');
    const currentLineage = chatLineage(chat);
    const currentTurn = narrativeTurnFromLineage(currentLineage);
    const sourceTurn = latestKnownNarrativeTurn(source);
    const divergenceMessageId = branchDivergenceMessageId(source, chat);
    const latestAssistantId = latestAssistantMessageId(chat);
    const preserveLatestScannedMessage = divergenceMessageId === null
        && Number.isInteger(source.lastScannedMessageId)
        && source.lastScannedMessageId === latestAssistantId;
    const rebasedAt = Date.now();
    const preRebaseSnapshot = snapshotForCheckpoint(source);
    const next = normalizeState(source, source.chatKey);

    next.npcs = next.npcs.map(npc => {
        const rebased = mode === 'rollback' ? rollbackRebasedRelationship(npc, divergenceMessageId) : structuredClone(npc);
        rebased.present = false;
        rebased.worldActive = false;
        rebased.firstSeenMessageId = null;
        rebased.lastSeenMessageId = null;
        rebased.lastInteractionMessageId = null;
        rebased.lastActivityMessageId = null;
        if (Number.isInteger(rebased.lastActivityTurn)) {
            const inactiveAge = Math.max(0, sourceTurn - rebased.lastActivityTurn);
            rebased.lastActivityTurn = Math.max(0, currentTurn - inactiveAge);
        } else {
            rebased.lastActivityTurn = currentTurn;
        }
        if (rebased.lastRelationshipChange) rebased.lastRelationshipChange = quarantineRebasedRelationshipAudit(rebased.lastRelationshipChange, rebasedAt);
        rebased.relationshipHistory = (rebased.relationshipHistory || []).map(event => quarantineRebasedRelationshipAudit(event, rebasedAt));
        rebased.relationshipMilestones = (rebased.relationshipMilestones || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        rebased.relationshipEvidenceHistory = (rebased.relationshipEvidenceHistory || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        rebased.relationshipDiagnostics = (rebased.relationshipDiagnostics || []).map(entry => quarantineRebasedRelationshipAudit(entry, rebasedAt));
        return rebased;
    });
    next.socialGraph = (next.socialGraph || []).map(edge => ({ ...edge, sourceMessageId: null }));
    next.lastObservation = { messageId: null, exchangeActiveNpcIds: [], finalPresentNpcIds: [], worldActiveNpcIds: [], targetNpcIds: [] };
    next.lastScannedMessageId = preserveLatestScannedMessage ? source.lastScannedMessageId : null;
    next.checkpoints = [];
    next.branchBase = null;
    next.branchHeadLineage = [];
    next.branchSafety = { status: 'safe', kind: '', reason: '' };
    next.rebaseBackup = {
        createdAt: rebasedAt,
        relationshipMode: mode,
        divergenceMessageId,
        sourceLastScannedMessageId: Number.isInteger(source.lastScannedMessageId) ? source.lastScannedMessageId : null,
        sourceLineage: Array.isArray(source.branchHeadLineage) ? [...source.branchHeadLineage] : [],
        snapshot: preRebaseSnapshot,
    };
    next.updatedAt = rebasedAt;
    return ensureBranchBase(normalizeState(next, source.chatKey), chat);
}`;

        source = replaceRegexOnce(source,
            /export function rebaseToCurrentChat\(state, chat = \[\]\) \{[\s\S]*?\n\}\n\n(?=function arraysEqual)/,
            replacement + '\n\n', 'replace rebase implementation');
        write(path, source);
    }
}

// Engine: mode propagation, preview API, pre-persist backup assertion, and one-shot relationship suppression.
{
    const path = 'v03/engine.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        source = replaceOnce(source,
`import { chatLineage, bestCheckpoint, ensureBranchBase, fingerprintMessage, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';`,
`import { chatLineage, bestCheckpoint, ensureBranchBase, fingerprintMessage, normalizeRebaseRelationshipMode, previewRelationshipRebase, rebaseToCurrentChat, reconcileToCurrentBranch, recordCheckpoint } from './branches.js';\n// ${MARKER}: preserve-mode rebase cannot mutate relationship state during its immediate refresh.`, 'engine branch imports');

        source = replaceOnce(source,
`    async function scan(messageId, { manual = false, force = false } = {}) {`,
`    async function scan(messageId, { manual = false, force = false, applyRelationship = null } = {}) {`, 'scan relationship override');

        source = replaceOnce(source,
`                applyReturnedNpcPatches: true,
                applyRelationship: !alreadyScannedMessage,
            });`,
`                applyReturnedNpcPatches: true,
                applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true,
            });`, 'scan apply relationship gate');

        source = replaceRegexOnce(source,
/    async function reconcileBranch\(\{ rescan = false, rebase = false \} = \{\}\) \{[\s\S]*?\n    \}\n\n(?=    return Object.freeze\(\{)/,
`    async function previewRebase({ relationshipMode = 'rollback' } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        const state = await loadChat(chatKey);
        if (!state) return { ok: false, reason: 'not-hydrated' };
        const mode = normalizeRebaseRelationshipMode(relationshipMode);
        return { ok: true, ...previewRelationshipRebase(state, getContext().chat || [], { relationshipMode: mode }) };
    }

    async function reconcileBranch({ rescan = false, rebase = false, relationshipMode = 'preserve' } = {}) {
        const chatKey = getChatKey();
        if (!chatKey || chatKey === 'no-chat') return { ok: false, reason: 'no-chat' };
        invalidate(chatKey);
        let result;
        const mode = rebase ? normalizeRebaseRelationshipMode(relationshipMode) : 'preserve';
        await exclusive(chatKey, async () => {
            const state = await loadChat(chatKey);
            if (recoveryBlocksLiveScan(state)) {
                result = { ok: false, reason: 'recovery-active', recovery: decoratedRecoveryStatus(state.recovery, chatKey) };
                return;
            }
            const chat = getContext().chat || [];
            if (rebase) {
                const rebased = rebaseToCurrentChat(state, chat, { relationshipMode: mode });
                if (!rebased.rebaseBackup?.snapshot) throw new Error('Timeline rebase refused to persist without a restorable pre-rebase snapshot.');
                const persisted = await persist(chatKey, rebased);
                result = {
                    ok: true,
                    changed: true,
                    rebased: true,
                    relationshipMode: mode,
                    unsafeDivergence: false,
                    checkpoint: persisted.branchBase || null,
                    rebaseBackup: persisted.rebaseBackup ? { createdAt: persisted.rebaseBackup.createdAt, relationshipMode: persisted.rebaseBackup.relationshipMode } : null,
                    state: structuredClone(persisted),
                };
                return;
            }
            const reconciled = reconcileToCurrentBranch(state, chat);
            if (reconciled.unsafeDivergence) {
                result = { ok: false, changed: false, unsafeDivergence: true, branchSafety: structuredClone(reconciled.state.branchSafety), state: structuredClone(reconciled.state) };
                return;
            }
            if (!reconciled.changed) {
                result = { ok: true, changed: false, unsafeDivergence: false, checkpoint: reconciled.checkpoint || null, state: structuredClone(reconciled.state) };
                return;
            }
            const persisted = await persist(chatKey, reconciled.state);
            result = { ok: true, changed: true, unsafeDivergence: false, checkpoint: reconciled.checkpoint || null, state: structuredClone(persisted) };
        });
        if (result?.unsafeDivergence || !result?.ok) return result;
        if (rescan && (rebase || getSettings().branchRescan !== false)) {
            const id = latestAssistantMessageId(getContext().chat || []);
            if (id >= 0) result.rescan = await scan(id, {
                manual: rebase === true,
                force: true,
                applyRelationship: rebase && mode === 'preserve' ? false : null,
            });
        }
        return result;
    }

`, 'engine reconcile mode split');

        source = replaceOnce(source,
`        recoveryRange,
        reconcileBranch,`,
`        recoveryRange,
        previewRebase,
        reconcileBranch,`, 'engine preview export');
        write(path, source);
    }
}

// Public API: expose rollback preview to the recovery UI.
{
    const path = 'v03/index.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        source = replaceOnce(source,
`    recoveryRange: options => engine.recoveryRange(options),`,
`    recoveryRange: options => engine.recoveryRange(options),\n    previewRebase: options => engine.previewRebase(options), // ${MARKER}`, 'public preview API');
        write(path, source);
    }
}

// Recovery UI: two explicit choices, rollback preview, preserve-safe default.
{
    const path = 'v03/branch-recovery-ui.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        const rebaseFn = `function relationshipRollbackPreviewText(preview = {}) {
    const rows = Array.isArray(preview.affectedNpcs) ? preview.affectedNpcs : [];
    if (!rows.length) return 'No traced relationship meter, history, milestone, evidence, or diagnostic changes would be rolled back.';
    const lines = rows.slice(0, 12).map(row => {
        const meters = (row.axes || []).map(axis => axis + ' ' + Number(row.before?.[axis] || 0) + ' -> ' + Number(row.after?.[axis] || 0));
        const removals = [];
        if (row.historyRemoved) removals.push('history -' + row.historyRemoved);
        if (row.milestonesRemoved) removals.push('milestones -' + row.milestonesRemoved);
        if (row.evidenceRemoved) removals.push('evidence -' + row.evidenceRemoved);
        if (row.diagnosticsRemoved) removals.push('diagnostics -' + row.diagnosticsRemoved);
        if (row.summaryCleared) removals.push('summary cleared');
        return '- ' + (row.name || row.npcId || 'NPC') + ': ' + [...meters, ...removals].join(', ');
    });
    if (rows.length > 12) lines.push('- ...and ' + (rows.length - 12) + ' more NPCs');
    return lines.join('\\n');
}

// ${MARKER}: timeline acceptance and relationship rollback are separate user decisions.
async function rebaseCurrentChat(relationshipMode = 'preserve', force = false) {
    if (running) return;
    const current = state();
    const required = branchRecoveryRequired(current);
    if (!required && force !== true) return render();
    const mode = relationshipMode === 'rollback' ? 'rollback' : 'preserve';
    let accepted = false;
    if (mode === 'rollback') {
        let preview;
        try { preview = await globalThis.NPCState?.previewRebase?.({ relationshipMode: 'rollback' }); }
        catch (error) { globalThis.toastr?.error?.('NPC State: could not preview relationship rollback. ' + (error?.message || error)); return; }
        if (!preview?.ok) { globalThis.toastr?.error?.('NPC State: could not preview relationship rollback. ' + (preview?.reason || 'preview failed')); return; }
        accepted = globalThis.confirm?.(
            'Roll back discarded story changes and accept the current chat timeline?\\n\\n' +
            relationshipRollbackPreviewText(preview) + '\\n\\n' +
            'This reverses relationship movement, fractional progress, milestones, history, and summaries only where discarded-message provenance supports the rollback. A restorable pre-rebase snapshot is saved first.'
        );
    } else {
        accepted = globalThis.confirm?.(
            (!required && force === true ? 'Force Timeline Rebase to the current visible chat?\\n\\n' : 'Keep NPC state and accept the current chat timeline?\\n\\n') +
            'Relationship meters, fractional progress, milestones, history, the last relationship change, and summaries are preserved. Existing relationship audit records are retained as accepted pre-rebase history with stale message provenance quarantined. The immediate refresh cannot award relationship movement again. A restorable pre-rebase snapshot is saved first.'
        );
    }
    if (!accepted) return;
    running = true;
    render();
    const toast = globalThis.toastr?.info?.('NPC State: rebasing to the current chat timeline...', '', { timeOut: 0, extendedTimeOut: 0 });
    try {
        const result = await globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true, relationshipMode: mode });
        if (!result?.ok) throw new Error(result?.reason || 'rebase failed');
        const modeText = mode === 'rollback' ? 'discarded relationship changes rolled back' : 'NPC relationship state preserved';
        if (result.rescan?.ok) globalThis.toastr?.success?.('NPC State: timeline rebased, ' + modeText + ', and the latest surviving exchange was refreshed.');
        else globalThis.toastr?.success?.('NPC State: timeline rebased with ' + modeText + '.');
    } catch (error) {
        const rebasedState = state();
        if (rebasedState?.branchSafety?.status === 'safe') {
            console.warn('[NPC State v0.4.29] timeline rebase committed, but the follow-up scan failed', error);
            globalThis.toastr?.warning?.('NPC State: timeline rebased successfully, but the latest exchange refresh failed. Use Scan current cast to retry. ' + (error?.message || error));
        } else {
            console.error('[NPC State v0.4.29] timeline rebase failed safely', error);
            globalThis.toastr?.error?.('NPC State: timeline rebase failed without replacing your durable dossiers. ' + (error?.message || error));
        }
    } finally {
        running = false;
        if (toast && globalThis.toastr?.clear) globalThis.toastr.clear(toast);
        render();
    }
}`;
        source = replaceRegexOnce(source,
            /async function rebaseCurrentChat\(force = false\) \{[\s\S]*?\n\}\n\n(?=function ensureForceControl)/,
            rebaseFn + '\n\n', 'replace recovery rebase handler');

        source = replaceOnce(source,
`        control.innerHTML = \`<span><b>Force Timeline Rebase</b><small>Bypasses normal branch detection and rebuilds against the currently visible chat. Durable dossier canon and manual edits are preserved.</small></span><button type="button" class="menu_button npc-state-v3-force-rebase-current" \${running ? 'disabled' : ''}><i class="fa-solid fa-code-branch"></i> \${running ? 'Rebasing...' : 'Force Timeline Rebase...'} </button>\`;
        control.querySelector('.npc-state-v3-force-rebase-current')?.addEventListener('click', () => rebaseCurrentChat(true));`,
`        control.innerHTML = \`<span><b>Force Timeline Rebase</b><small>Accept the current visible chat as canon. Keeping NPC state is the safe default; rollback is a separate destructive choice with a relationship preview.</small></span><div class="npc-state-v3-branch-recovery-actions"><button type="button" class="menu_button npc-state-v3-force-rebase-preserve" \${running ? 'disabled' : ''}><i class="fa-solid fa-shield-heart"></i> Keep NPC state and accept timeline</button><button type="button" class="menu_button npc-state-v3-force-rebase-rollback" \${running ? 'disabled' : ''}><i class="fa-solid fa-rotate-left"></i> Roll back discarded story changes</button></div>\`;
        control.querySelector('.npc-state-v3-force-rebase-preserve')?.addEventListener('click', () => rebaseCurrentChat('preserve', true));
        control.querySelector('.npc-state-v3-force-rebase-rollback')?.addEventListener('click', () => rebaseCurrentChat('rollback', true));`, 'force rebase controls');

        source = replaceOnce(source,
`        banner.innerHTML = \`<b>Timeline rebase required</b><small>\${messageForKind(kind)} Durable dossiers are intact. Rebase only if the remaining chat is now the canon you want to keep.</small><div class="npc-state-v3-branch-recovery-actions"><button type="button" class="menu_button npc-state-v3-rebase-current"><i class="fa-solid fa-code-branch"></i> \${running ? 'Rebasing...' : 'Rebase to current chat'}</button></div>\`;
        banner.querySelector('.npc-state-v3-rebase-current')?.addEventListener('click', rebaseCurrentChat);`,
`        banner.innerHTML = \`<b>Timeline rebase required</b><small>\${messageForKind(kind)} Durable dossiers are intact. Rebase to current chat only if the remaining chat is now the canon you want to keep. Choose whether relationship state is preserved or explicitly rolled back.</small><div class="npc-state-v3-branch-recovery-actions"><button type="button" class="menu_button npc-state-v3-rebase-preserve"><i class="fa-solid fa-shield-heart"></i> \${running ? 'Rebasing...' : 'Keep NPC state and accept timeline'}</button><button type="button" class="menu_button npc-state-v3-rebase-rollback"><i class="fa-solid fa-rotate-left"></i> Roll back discarded story changes</button></div>\`;
        banner.querySelector('.npc-state-v3-rebase-preserve')?.addEventListener('click', () => rebaseCurrentChat('preserve', false));
        banner.querySelector('.npc-state-v3-rebase-rollback')?.addEventListener('click', () => rebaseCurrentChat('rollback', false));`, 'required rebase controls');
        write(path, source);
    }
}

// Settings copy: explain that Force Timeline Rebase no longer implies relationship rollback.
{
    const path = 'v03/settings-layout.js';
    let source = read(path);
    if (!source.includes(MARKER)) {
        source = replaceOnce(source,
`const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';`,
`const ADVANCED_RECOVERY_ID = 'npc_state_v0414_advanced_recovery';\n// ${MARKER}: force rebase exposes preserve and rollback as separate modes.`, 'settings marker');
        source = replaceOnce(source,
`const intro = makeElement('div', 'npc-state-v3-advanced-recovery-intro', 'Force Timeline Rebase bypasses normal branch detection. Use it only when ordinary recovery cannot identify the timeline change correctly.');`,
`const intro = makeElement('div', 'npc-state-v3-advanced-recovery-intro', 'Force Timeline Rebase bypasses normal branch detection. It can keep current NPC relationship state while accepting the visible timeline, or explicitly roll back discarded story relationship changes after showing a preview.');`, 'settings force rebase description');
        write(path, source);
    }
}

// Historical regression contracts now name rollback explicitly. This edit is idempotent so the phase can replay on every cold build.
{
    const path = 'beta/verify-phase14-rebase-relationship-rollback-0.4.9.mjs';
    let source = read(path);
    source = source.replace('const rebased = rebaseToCurrentChat(state, rewrittenChat);', "const rebased = rebaseToCurrentChat(state, rewrittenChat, { relationshipMode: 'rollback' });");
    source = source.replace("assert.equal(npc.relationshipEvidenceHistory.length, 0, 'Full rebase retained timeline-local relationship evidence');", "assert.equal(npc.relationshipEvidenceHistory.length, 0, 'Explicit rollback retained discarded relationship evidence');");
    source = source.replace("assert.equal(npc.relationshipDiagnostics.length, 0, 'Full rebase retained timeline-local relationship diagnostics');", "assert.equal(npc.relationshipDiagnostics.length, 0, 'Explicit rollback retained discarded relationship diagnostics');");
    source = source.replace("assert(recoveryUi.includes('Relationship changes and milestone breakthroughs attributable to discarded branch messages are rolled back'), 'Rebase confirmation still implies all relationship state is preserved');", "assert(recoveryUi.includes('Roll back discarded story changes'), 'Explicit rollback action is missing');");
    write(path, source);
}
{
    const path = 'beta/verify-phase15-force-rebase-0.4.10.mjs';
    let source = read(path);
    source = source.replace('const rebased = rebaseToCurrentChat(state, chat);', "const rebased = rebaseToCurrentChat(state, chat, { relationshipMode: 'preserve' });");
    source = source.replace('const rebased = rebaseToCurrentChat(state, rewrittenChat);', "const rebased = rebaseToCurrentChat(state, rewrittenChat, { relationshipMode: 'preserve' });");
    source = source.replace("assert(recoveryUi.includes('Force Timeline Rebase...'), 'Force rebase button label is missing');", "assert(recoveryUi.includes('Keep NPC state and accept timeline'), 'Preserve rebase action is missing');");
    source = source.replace("assert(recoveryUi.includes('rebaseCurrentChat(true)'), 'Force rebase button is not wired to the explicit force path');", "assert(recoveryUi.includes(\"rebaseCurrentChat('preserve', true)\"), 'Force preserve rebase is not wired');");
    source = source.replace("assert(recoveryUi.includes('preserves that scan marker so the refresh cannot apply its relationship delta twice'), 'Force rebase confirmation does not explain duplicate relationship protection');", "assert(recoveryUi.includes('The immediate refresh cannot award relationship movement again'), 'Preserve rebase confirmation does not explain duplicate relationship protection');");
    write(path, source);
}

// Update historical verifier contracts that intentionally refer to the old single-mode rebase API.
{
    const path = 'beta/verify-final-0.4.1.mjs';
    let source = read(path);
    source = source.replace("assert(engine.includes('applyRelationship: !alreadyScannedMessage'), 'Repeated forced scan can replay relationship deltas');", "assert(engine.includes('applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true'), 'Repeated forced scan relationship gate lost its idempotent default');");
    write(path, source);
}
{
    const path = 'beta/verify-phase11-branch-recovery-ui-0.4.6.mjs';
    let source = read(path);
    source = source.replace("assert(source.includes('Rebase to current chat'), 'Rebase action label disappeared');", "assert(source.includes('Keep NPC state and accept timeline'), 'Safe rebase action label disappeared');");
    source = source.replace("assert(source.includes(\"globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true })\"), 'Rebase action lost engine wiring');", "assert(source.includes(\"globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true, relationshipMode: mode })\"), 'Rebase action lost mode-aware engine wiring');");
    write(path, source);
}
{
    const path = 'beta/verify-phase22-settings-ui-cleanup-0.4.14.mjs';
    let source = read(path);
    source = source.replace("assert(recovery.includes('rebaseCurrentChat(true)'), 'Force rebase behavior was accidentally removed');", "assert(recovery.includes(\"rebaseCurrentChat('preserve', true)\"), 'Force preserve rebase behavior was accidentally removed');");
    write(path, source);
}
{
    const path = 'beta/verify-phase24-release-source-parity-0.4.14.mjs';
    let source = read(path);
    source = source.replace("assert(recovery.includes('rebaseCurrentChat(true)'), 'Committed Force Rebase behavior is missing');", "assert(recovery.includes(\"rebaseCurrentChat('preserve', true)\"), 'Committed Force Preserve Rebase behavior is missing');");
    source = source.replace("assert(recovery.includes('Force Timeline Rebase...'), 'Committed Force Rebase label is stale');", "assert(recovery.includes('Keep NPC state and accept timeline'), 'Committed Force Rebase preserve label is missing');");
    source = source.replace("assert(phase15.includes('Force Timeline Rebase...') && phase15.includes('ensureForceControl(forceHost || host)'), 'v0.4.10 force-rebase verifier compatibility is not persisted');", "assert(phase15.includes('Keep NPC state and accept timeline') && phase15.includes('ensureForceControl(forceHost || host)'), 'v0.4.10 preserve-mode force-rebase verifier compatibility is not persisted');");
    write(path, source);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let source = read(path);
    source = source.replace(
`test('cross-chat import and rebase clear timeline-local evidence, preserve durable relationship state', () => {
    const state = apply(stateWith({ relationship: { trust: 25 } }), 'Mira trusts Lucien with her private correspondence.');
    const bundle = createNpcStateBundle(state);
    const imported = applyNpcStateBundleImport(createEmptyState('different-chat'), bundle);
    assert.equal(imported.ok, true);
    const rebased = rebaseToCurrentChat(state, [{ is_user: false, mes: 'Mira arrives.' }]);
    for (const next of [imported.state, rebased]) {
        assert.deepEqual(npc(next).relationshipEvidenceHistory, []);
        assert.deepEqual(npc(next).relationshipDiagnostics, []);
        assert.deepEqual(npc(next).relationship, npc(state).relationship);
        assert.equal(npc(next).relationshipHistory[0].sourceMessageId, null);
    }
    assert.deepEqual(npc(imported.state).relationshipMilestones, npc(state).relationshipMilestones);
    assert.deepEqual(
        npc(rebased).relationshipMilestones,
        npc(state).relationshipMilestones.map(entry => ({ ...entry, sourceMessageId: null, turn: null })),
    );
});`,
`test('cross-chat import clears timeline-local evidence while preserve rebase quarantines it as audit history', () => {
    const state = apply(stateWith({ relationship: { trust: 25 } }), 'Mira trusts Lucien with her private correspondence.');
    const bundle = createNpcStateBundle(state);
    const imported = applyNpcStateBundleImport(createEmptyState('different-chat'), bundle);
    assert.equal(imported.ok, true);
    const rebased = rebaseToCurrentChat(state, [{ is_user: false, mes: 'Mira arrives.' }], { relationshipMode: 'preserve' });
    assert.deepEqual(npc(imported.state).relationshipEvidenceHistory, []);
    assert.deepEqual(npc(imported.state).relationshipDiagnostics, []);
    for (const next of [imported.state, rebased]) {
        assert.deepEqual(npc(next).relationship, npc(state).relationship);
        assert.equal(npc(next).relationshipHistory[0].sourceMessageId, null);
    }
    assert(npc(rebased).relationshipEvidenceHistory.length > 0);
    assert(npc(rebased).relationshipDiagnostics.length > 0);
    for (const row of [...npc(rebased).relationshipEvidenceHistory, ...npc(rebased).relationshipDiagnostics]) {
        assert.equal(row.sourceMessageId, null);
        assert.equal(row.timelineStatus, 'accepted-pre-rebase');
        assert(Number.isInteger(row.originalSourceMessageId));
    }
    assert.deepEqual(npc(imported.state).relationshipMilestones, npc(state).relationshipMilestones);
    for (const milestone of npc(rebased).relationshipMilestones) {
        assert.equal(milestone.sourceMessageId, null);
        assert.equal(milestone.turn, null);
        assert.equal(milestone.timelineStatus, 'accepted-pre-rebase');
    }
});`);
    write(path, source);
}

console.log('Applied v0.4.29 phase61 safe timeline rebase relationship modes');
