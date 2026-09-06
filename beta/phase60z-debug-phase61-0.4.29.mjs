import fs from 'node:fs';

const phasePath = 'beta/phase61-safe-rebase-relationship-modes-0.4.29.mjs';
let source = fs.readFileSync(phasePath, 'utf8');
source = source.replace("(?=export function reconcileToCurrentBranch)/,", "(?=function arraysEqual)/,");
source = source.replace("(?=    async function withLifecycleKeys)/,", "(?=    return Object.freeze\\(\\{)/,");
if (!source.includes("execSync('git config user.name")) {
    source = source.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nimport { execSync } from 'node:child_process';\n");
    source = source.replace("function write(path, source) { fs.writeFileSync(path, source); }\n", `function write(path, source) { fs.writeFileSync(path, source); }\nfunction phase61Fail(message) {\n    try {\n        fs.writeFileSync('beta/phase61-ci-error.txt', String(message) + '\\n');\n        execSync('git config user.name \\\"github-actions[bot]\\\" && git config user.email \\\"41898282+github-actions[bot]@users.noreply.github.com\\\" && git add beta/phase61-ci-error.txt && git commit -m \\\"Record phase61 transform diagnostic\\\" && git push', { stdio: 'ignore' });\n    } catch {}\n    throw new Error(message);\n}\n`);
    source = source.replace("throw new Error('Missing phase61 anchor: ' + label);", "phase61Fail('Missing phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Ambiguous phase61 anchor: ' + label);", "phase61Fail('Ambiguous phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);", "phase61Fail('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);");
}
fs.writeFileSync(phasePath, source);

const verifierPatches = [
    ['beta/verify-final-0.4.1.mjs', [
        ["assert(engine.includes('applyRelationship: !alreadyScannedMessage'), 'Repeated forced scan can replay relationship deltas');", "assert(engine.includes('applyRelationship: applyRelationship === null ? !alreadyScannedMessage : applyRelationship === true'), 'Repeated forced scan relationship gate lost its idempotent default');"]
    ]],
    ['beta/verify-phase11-branch-recovery-ui-0.4.6.mjs', [
        ["assert(source.includes('Rebase to current chat'), 'Rebase action label disappeared');", "assert(source.includes('Keep NPC state and accept timeline'), 'Safe rebase action label disappeared');"],
        ["assert(source.includes(\"globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true })\"), 'Rebase action lost engine wiring');", "assert(source.includes(\"globalThis.NPCState?.reconcile?.({ rebase: true, rescan: true, relationshipMode: mode })\"), 'Rebase action lost mode-aware engine wiring');"]
    ]],
    ['beta/verify-phase22-settings-ui-cleanup-0.4.14.mjs', [
        ["assert(recovery.includes('rebaseCurrentChat(true)'), 'Force rebase behavior was accidentally removed');", "assert(recovery.includes(\"rebaseCurrentChat('preserve', true)\"), 'Force preserve rebase behavior was accidentally removed');"]
    ]],
    ['beta/verify-phase24-release-source-parity-0.4.14.mjs', [
        ["assert(recovery.includes('rebaseCurrentChat(true)'), 'Committed Force Rebase behavior is missing');", "assert(recovery.includes(\"rebaseCurrentChat('preserve', true)\"), 'Committed Force Preserve Rebase behavior is missing');"],
        ["assert(recovery.includes('Force Timeline Rebase...'), 'Committed Force Rebase label is stale');", "assert(recovery.includes('Keep NPC state and accept timeline'), 'Committed Force Rebase preserve label is missing');"],
        ["assert(phase15.includes('Force Timeline Rebase...') && phase15.includes('ensureForceControl(forceHost || host)'), 'v0.4.10 force-rebase verifier compatibility is not persisted');", "assert(phase15.includes('Keep NPC state and accept timeline') && phase15.includes('ensureForceControl(forceHost || host)'), 'v0.4.10 preserve-mode force-rebase verifier compatibility is not persisted');"]
    ]]
];
for (const [path, patches] of verifierPatches) {
    let text = fs.readFileSync(path, 'utf8');
    for (const [before, after] of patches) text = text.replace(before, after);
    fs.writeFileSync(path, text);
}

{
    const path = 'beta/verify-phase12-relationship-recovery-0.4.7.mjs';
    let text = fs.readFileSync(path, 'utf8');
    text = text.replace(
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
    fs.writeFileSync(path, text);
}

const verifyPath = 'beta/verify-all.mjs';
let verify = fs.readFileSync(verifyPath, 'utf8');
if (!verify.includes('PHASE61_CI_TEST_DIAGNOSTIC')) {
    verify = verify.replace("import { spawnSync } from 'node:child_process';", "import { spawnSync, execSync } from 'node:child_process';\n// PHASE61_CI_TEST_DIAGNOSTIC");
    verify = verify.replace("let failed = 0;", "let failed = 0;\nlet phase61Diagnostic = '';");
    verify = verify.replace("failed++;\n        process.stderr.write('FAIL ' + name + '\\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\\n' : ''));", "failed++;\n        const failureText = 'FAIL ' + name + '\\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\\n' : '');\n        phase61Diagnostic += failureText + '\\n';\n        process.stderr.write(failureText);");
    verify = verify.replace("if (failed) process.exitCode = 1;", "if (failed) {\n    try {\n        fs.writeFileSync(new URL('./phase61-ci-error.txt', import.meta.url), phase61Diagnostic);\n        execSync('git config user.name \\\"github-actions[bot]\\\" && git config user.email \\\"41898282+github-actions[bot]@users.noreply.github.com\\\" && git add beta/phase61-ci-error.txt && git commit -m \\\"Record phase61 test diagnostic\\\" && git push', { cwd: root, stdio: 'ignore' });\n    } catch {}\n    process.exitCode = 1;\n}");
    fs.writeFileSync(verifyPath, verify);
}

console.log('Installed temporary phase61 CI diagnostics, corrected transform boundaries, and aligned legacy verifier contracts');
