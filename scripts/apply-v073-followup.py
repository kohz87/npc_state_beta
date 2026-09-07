from pathlib import Path

ROOT = Path('.')
def read(path): return (ROOT/path).read_text()
def write(path, text): (ROOT/path).write_text(text)
def replace_once(path, old, new):
    text = read(path)
    if text.count(old) != 1:
        raise SystemExit(f'{path}: expected one replacement, found {text.count(old)}')
    write(path, text.replace(old, new, 1))

# Remove unused migration-result plumbing. Migration remains authoritative through the migrated NPC.
replace_once(
    'src/engine.js',
    """            let migrationLimitations = [];\n            if (hasRelationshipPatch && !clearRelationshipCorrections) {\n                const migrated = migrateSupportedLegacyManualRelationshipCorrections(current);\n                current = migrated.npc;\n                migrationLimitations = migrated.limitations || [];\n                state.npcs[index] = current;\n            }\n""",
    """            if (hasRelationshipPatch && !clearRelationshipCorrections) {\n                const migrated = migrateSupportedLegacyManualRelationshipCorrections(current);\n                current = migrated.npc;\n                state.npcs[index] = current;\n            }\n"""
)
replace_once(
    'src/engine.js',
    """                    remediation: true,\n                    migratedLegacyAxes: migrationLimitations.length ? [] : undefined,\n                    resolved: state.branchSafety?.status === 'safe',\n""",
    """                    remediation: true,\n                    resolved: state.branchSafety?.status === 'safe',\n"""
)

# Remediation persistence failures should have an honest structured API result while the
# cached/reloaded branch remains at the previously persisted blocked boundary.
replace_once(
    'src/engine.js',
    """            const commit = await commitState({ operationId, token: ownership, state, chat, messageId, checkpointReason, checkpoint: unsafeRemediation ? false : checkpoint, ownershipPolicy: 'user' });\n            return { ok: true, label, state: structuredClone(commit.state), result, needsReconcile: commit.needsReconcile === true, reason: commit.reason || '' };\n""",
    """            let commit;\n            try {\n                commit = await commitState({ operationId, token: ownership, state, chat, messageId, checkpointReason, checkpoint: unsafeRemediation ? false : checkpoint, ownershipPolicy: 'user' });\n            } catch (error) {\n                if (!unsafeRemediation) throw error;\n                const persistedBlocked = cache.get(chatKey) || state;\n                return {\n                    ok: false, label, reason: 'correction-remediation-persistence-failed', persistenceFailed: true,\n                    error: String(error?.message || error).slice(0, 500),\n                    state: structuredClone(persistedBlocked), result,\n                };\n            }\n            return { ok: true, label, state: structuredClone(commit.state), result, needsReconcile: commit.needsReconcile === true, reason: commit.reason || '' };\n"""
)

# The uncertainty warning must not offer generic timeline acceptance as a shortcut. Keep
# explicit rebase modes unchanged for their established branch-divergence states.
insert_after = """export function branchRecoveryRequired(value = readBranchSafetyStatus()) {\n    const safety = value?.branchSafety || value;\n    return Boolean(safety && safety.status !== 'safe');\n}\n"""
replace_once(
    'src/branch-recovery-ui.js',
    insert_after,
    insert_after + """\nexport function branchSafetyNeedsCorrectionRemediation(value = readBranchSafetyStatus()) {\n    const safety = value?.branchSafety || value;\n    return Boolean(safety && safety.status !== 'safe' && safety.kind === 'manual-relationship-correction-uncertain');\n}\n"""
)

old = """    const kind = String(current?.kind || '');\n    let banner = existing;\n    if (!banner) {\n        banner = globalThis.document.createElement('div');\n        banner.id = BANNER_ID;\n    }\n    placeBanner(host, banner);\n\n    const renderKey = `${kind}|${running ? '1' : '0'}`;\n    if (banner.dataset.renderKey !== renderKey) {\n        banner.dataset.renderKey = renderKey;\n        banner.dataset.running = running ? '1' : '0';\n        banner.innerHTML = `<b>Timeline rebase required</b><small>${messageForKind(kind)} Durable dossiers are intact. Rebase to current chat only if the remaining chat is now the canon you want to keep. Choose whether relationship state is preserved or explicitly rolled back.</small><div class=\"npc-state-v3-branch-recovery-actions\"><button type=\"button\" class=\"menu_button npc-state-v3-rebase-preserve\"><i class=\"fa-solid fa-shield-heart\"></i> ${running ? 'Rebasing...' : 'Keep NPC state and accept timeline'}</button><button type=\"button\" class=\"menu_button npc-state-v3-rebase-rollback\"><i class=\"fa-solid fa-rotate-left\"></i> Roll back discarded story changes</button></div>`;\n        banner.querySelector('.npc-state-v3-rebase-preserve')?.addEventListener('click', () => rebaseCurrentChat('preserve', false));\n        banner.querySelector('.npc-state-v3-rebase-rollback')?.addEventListener('click', () => rebaseCurrentChat('rollback', false));\n    }\n    return true;\n"""
new = """    const kind = String(current?.kind || '');\n    let banner = existing;\n    if (!banner) {\n        banner = globalThis.document.createElement('div');\n        banner.id = BANNER_ID;\n    }\n    placeBanner(host, banner);\n\n    const renderKey = `${kind}|${running ? '1' : '0'}`;\n    if (banner.dataset.renderKey !== renderKey) {\n        banner.dataset.renderKey = renderKey;\n        banner.dataset.running = running ? '1' : '0';\n        if (branchSafetyNeedsCorrectionRemediation(current)) {\n            banner.innerHTML = `<b>Relationship correction confirmation required</b><small>${messageForKind(kind)} The verified rollback boundary is preserved; confirming or clearing correction ownership will revalidate it without accepting stale story state.</small><div class=\"npc-state-v3-branch-recovery-actions\"><button type=\"button\" class=\"menu_button npc-state-v3-open-correction-remediation\"><i class=\"fa-solid fa-address-book\"></i> Open dossier library</button></div>`;\n            banner.querySelector('.npc-state-v3-open-correction-remediation')?.addEventListener('click', () => globalThis.NPCState?.openLibrary?.());\n        } else {\n            banner.innerHTML = `<b>Timeline rebase required</b><small>${messageForKind(kind)} Durable dossiers are intact. Rebase to current chat only if the remaining chat is now the canon you want to keep. Choose whether relationship state is preserved or explicitly rolled back.</small><div class=\"npc-state-v3-branch-recovery-actions\"><button type=\"button\" class=\"menu_button npc-state-v3-rebase-preserve\"><i class=\"fa-solid fa-shield-heart\"></i> ${running ? 'Rebasing...' : 'Keep NPC state and accept timeline'}</button><button type=\"button\" class=\"menu_button npc-state-v3-rebase-rollback\"><i class=\"fa-solid fa-rotate-left\"></i> Roll back discarded story changes</button></div>`;\n            banner.querySelector('.npc-state-v3-rebase-preserve')?.addEventListener('click', () => rebaseCurrentChat('preserve', false));\n            banner.querySelector('.npc-state-v3-rebase-rollback')?.addEventListener('click', () => rebaseCurrentChat('rollback', false));\n        }\n    }\n    return true;\n"""
replace_once('src/branch-recovery-ui.js', old, new)

# Extend the behavioral test with the runtime branch selector and structured failure result.
test_path = 'tests/v073-correction-remediation.test.mjs'
t = read(test_path)
replace_once(
    test_path,
    "import { manualRelationshipRemediationPatch } from '../src/ui.js';",
    "import { manualRelationshipRemediationPatch } from '../src/ui.js';\nimport { branchSafetyNeedsCorrectionRemediation } from '../src/branch-recovery-ui.js';"
)
insert = """\ntest('uncertainty UI routes to correction remediation instead of generic timeline acceptance', () => {\n    assert.equal(branchSafetyNeedsCorrectionRemediation({ status: 'rebase-required', kind: 'manual-relationship-correction-uncertain' }), true);\n    assert.equal(branchSafetyNeedsCorrectionRemediation({ status: 'rebase-required', kind: 'suffix-recovery-required' }), false);\n    assert.equal(branchSafetyNeedsCorrectionRemediation({ status: 'safe', kind: '' }), false);\n});\n"""
anchor = "\ntest('persistence conflict during remediation leaves persisted state blocked and reload honest', async () => {"
if anchor not in t:
    raise SystemExit('test anchor missing')
t = t.replace(anchor, insert + anchor, 1)
oldtest = """    fail = true;\n    await assert.rejects(() => h.engine.clearManualRelationshipCorrection('sora'));\n    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');\n"""
newtest = """    fail = true;\n    const failed = await h.engine.clearManualRelationshipCorrection('sora');\n    assert.equal(failed.ok, false);\n    assert.equal(failed.reason, 'correction-remediation-persistence-failed');\n    assert.equal(failed.persistenceFailed, true);\n    assert.equal(failed.state.branchSafety.kind, 'manual-relationship-correction-uncertain');\n    assert.equal(h.persisted().branchSafety.kind, 'manual-relationship-correction-uncertain');\n"""
if oldtest not in t:
    raise SystemExit('persistence test anchor missing')
t = t.replace(oldtest, newtest, 1)
write(test_path, t)

# Document that the uncertainty banner cannot use generic timeline acceptance as remediation.
core = read('docs/core-contract.md')
oldcore = 'While the branch is blocked specifically for manual relationship correction uncertainty, the editor/API may perform only narrow remediation: confirm one relationship axis or explicitly clear that NPC relationship correction ownership. That remediation creates no narrative checkpoint and immediately reruns the existing checkpoint reconciliation. Other mutations remain blocked.'
newcore = oldcore + ' The recovery banner routes this state to dossier remediation and does not offer generic timeline acceptance as a shortcut.'
if oldcore not in core:
    raise SystemExit('core contract remediation sentence missing')
write('docs/core-contract.md', core.replace(oldcore, newcore, 1))

changelog = read('CHANGELOG.md')
oldchange = '- Adds a narrowly scoped remediation path for `manual-relationship-correction-uncertain`: the editor/API can confirm one relationship axis at a time or explicitly clear that NPC relationship correction ownership while unrelated mutations and automatic story updates remain blocked. Remediation does not create a narrative checkpoint and immediately revalidates the verified rollback boundary.'
newchange = oldchange + ' The warning routes to the dossier flow rather than offering generic timeline acceptance, and remediation persistence failures return a structured blocked result.'
if oldchange not in changelog:
    raise SystemExit('changelog remediation line missing')
write('CHANGELOG.md', changelog.replace(oldchange, newchange, 1))

print('Applied v0.7.3 remediation follow-up polish.')
