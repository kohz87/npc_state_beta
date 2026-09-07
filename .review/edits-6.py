apply([
('CHANGELOG.md', '11e313d4fffd620e1b14e223f49bd1a2b34a3d49', [
(7, 0, r'''- Independent review closed same-narrative capture supersession during saves and the first-pass-to-completeness history gap. Duplicate host events preserve malformed-tag diagnostics; known legacy identity spelling normalization and sparse swipe metadata remain compatible.
'''),
]),
('docs/core-contract.md', '508046deded1b8f9513615b804ef8de1c01fbe0c', [
(74, 1, r'''Parsing and compatibility validation occur at the scanner boundary before identity preparation, not in a parallel application path. Retained compatibility is narrow: the older `finalPresentNpcIds` envelope alias must agree with `inChatNpcIds` if both are supplied; existing classification aliases proper-name/proper and role/unnamed normalize to named and role-label without conferring admission. Preserve historical case/whitespace/underscore normalization; an empty legacy classification is unspecified, not a named-identity claim. Older direct callers may omit supplemental arrays under their established non-live parser options; the strict live path requires all seven. A complete surrounding JSON fence remains supported for older separate scanners. Supported legacy semantic shapes still pass through the existing adapter. No canonicalName/activityRefs/nested-live/relationshipToPlayer dialect is added, and no respect/attraction axis conversion is performed.
'''),
(145, 1, r'''`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a legacy patch explicitly records evaluated dossier groups with no field update. Modern fieldEvaluations can separately report explicit unchanged, insufficient-evidence, and context-unavailable field ids. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics account for direct new-dossier bootstrap writes, semantic writes, Current Dynamic decisions, identity failures, validation rejection, accepted application, and missing/incomplete evaluation without double-counting the same effective field update. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting. Capture metadata contains a unique attempt id, bounded transport hash, chat identity, message position/fingerprint, active swipe, and canonical history length/hash. If the host has not populated active swipe metadata yet, only a versioned message copy explicitly owned by that same swipe/fingerprint may be selected, with chat/history validation still required. First-pass operations carry the same attempt id and history identity. Attempt ownership participates in the pre/post-save commit guard, so a newer captured payload invalidates an older pending application even when visible narrative is unchanged. On-demand inspection matches all of these, never position/swipe alone. A failed new attempt cannot borrow an older committed outcome. Edited/replaced content, renumbering, changed preceding history, and chat/swipe switches invalidate ownership; unprocessed replacement transport also prevents an old result from appearing current. Legacy metadata without ownership and operations lost on reload/ledger eviction report application unavailable, not committed. Parsing, application, persistence, rejected/stale state, and unavailable evidence are distinct. Only already-retained successful payloads are inspectable/copyable; failed output retains bounded reasons and a hash, not raw content. There is no second payload archive.
'''),
(147, 1, r'''Completion deduplication includes the canonical cleaned history boundary and transport identity, so changing only the embedded payload cannot suppress a new parse failure. Removing a malformed tag does not erase that failure on a duplicate host completion event. Delayed transport cleanup validates the same chat/history/capture and transport hash before stripping, and asynchronous completion bookkeeping may not write to a replaced source. First-pass application captures history ownership before waiting for hydration/exclusive access and revalidates afterward. Optional completeness also validates the original completed-response history before requesting a model result and after queued hydration.
'''),
]),
('src/engine.js', 'c1f4af0f84d792483ae84444138b918c945b2c26', [
(57, 1, r'''import { activeSwipeMetadata, captureSourceMatches, createOperationDiagnostics, operationHistoryIdentity, summarizeProposalDiagnostics } from './operation-diagnostics.js';
'''),
(335, 1, r'''    function captureOperationOwnership(type, chatKey, chat = [], messageId = null, { completeness = false, captureId = '' } = {}) {
'''),
(340, 0, r'''            captureId: String(captureId || ''),
'''),
(359, 0, r'''        if (token.captureId && activeSwipeMetadata(live).meta?.captureId !== token.captureId) return false;
'''),
(381, 1, r'''                ...(token?.captureId ? { captureId: token.captureId } : {}),
'''),
(799, 2, r'''        const ownership = captureOperationOwnership('first-pass', chatKey, getContext().chat || [], messageId, { captureId: options.captureId });
        const operationId = beginOperationDiagnostics(ownership);
'''),
(904, 1, r'''    async function completenessScan(messageId, { expectedFingerprint = '', expectedSwipeId = null, expectedSource = null } = {}) {
'''),
(911, 0, r'''        const ownership = captureOperationOwnership('completeness', chatKey, getContext().chat || [], messageId, { completeness: true });
'''),
(913, 0, r'''            if (!operationOwnershipMatches(ownership) || (expectedSource && !captureSourceMatches(expectedSource, getChatKey(), getContext().chat || [], messageId))) {
                return { ok: false, discarded: true, reason: 'source-changed-before-completeness', kind: 'completeness', messageId };
            }
'''),
(926, 1, r''''''),
]),
('src/index.js', '34e1d24bd9cc4c1400544ea35c256ceb8684f3b1', [
(269, 3, r'''export function completedResponseIdentity(chatKey, messageId, message = {}, chat = [message]) {
    const control = consumeNpcStateControl(message.mes);
    // Removal of a malformed/partial transport tag must not change completion identity
    // between the host's duplicate completion events. Narrative ownership stays strict.
    const identityChat = chat.slice(0, messageId + 1);
    identityChat[messageId] = control.found ? { ...message, mes: control.cleanedText } : message;
    const source = captureSourceIdentity(chatKey, identityChat, messageId);
    const transportHash = control.found ? captureTransportHash(control.raw) : (activeSwipeMetadata(message).meta?.transportHash || '');
    return [chatKey, messageId, source.swipeId, source.fingerprint, source.history.length, source.history.hash, transportHash].join('|');
'''),
(428, 4, r'''        identity: completedResponseIdentity(chatKey, id, message, ctx.chat),
'''),
]),
('src/operation-diagnostics.js', 'acd42f25fc8263960236e5c3ef1397422f729782', [
(109, 1, r'''    if (Array.isArray(message?.swipe_info)) {
        const meta = swipe?.extra?.npc_state_beta_v1;
        if (meta) return { swipeId, meta, source: 'swipe' };
        // Some host lifecycles populate swipe_info after message.extra. Only an
        // explicitly owned current-message copy may fill that gap, never legacy data
        // or another swipe. Callers also validate chat and complete history ownership.
        const pending = message?.extra?.npc_state_beta_v1;
        if (pending?.version === 2 && pending.captureId && pending.source?.swipeId === swipeId
            && pending.source?.fingerprint === fingerprintMessage(message)) return { swipeId, meta: pending, source: 'message' };
        return { swipeId, meta: null, source: 'swipe' };
    }
'''),
]),
('src/scan-payload.js', 'f9854068d7e7d2f8ec5ebc0f3074d3d6fbd4f681', [
(17, 0, r'''function canonicalIdentityKind(value) {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    // Empty was historically unspecified, not proof of a named identity.
    return !key || SCAN_IDENTITY_KINDS.includes(key) ? key : (has(LEGACY_IDENTITY_KINDS, key) ? LEGACY_IDENTITY_KINDS[key] : null);
}

'''),
(25, 1, r'''    if (has(npc, 'identityKind') && canonicalIdentityKind(npc.identityKind) === null) {
'''),
(69, 1, r'''            if (object(npc) && has(npc, 'identityKind')) return { ...npc, identityKind: canonicalIdentityKind(npc.identityKind) };
'''),
]),
('tests/helpers/host-harness.mjs', 'd6a164fe5e1fb139c37705ee299fb04d3bc4ecc4', [
(46, 1, r'''            const response = await host.beforeWrite?.();
            if (response) return response;
'''),
]),
('tests/v077-host-capture.test.mjs', 'fc6aeaca549b4abfb9c0d7477386e04d933657da', [
(139, 1, r'''    const before = h.persisted();
    h.beforeWrite = () => ({ ok: false, status: 403, text: async () => 'fixture persistence denied' });
'''),
(147, 0, r'''    assert.deepEqual(h.persisted(), before);
'''),
(172, 0, r'''
test('a newer capture attempt invalidates an earlier in-flight save even when the narrative is identical', () => withHost(async h => {
    h.context.chat = chatFor();
    const entered = deferred(), release = deferred(); let first = true;
    h.beforeWrite = async () => { if (first) { first = false; entered.resolve(); await release.promise; } };
    const older = h.entry.processCompletedAssistantResponse(1);
    await entered.promise;
    h.context.chat[1].mes = visible + '\n' + wrap('{bad}');
    const newer = await h.entry.processCompletedAssistantResponse(1);
    release.resolve();
    const result = await older;
    assert.equal(newer.ok, false);
    assert.equal(result.ok, false);
    assert.equal(result.discarded, true);
    assert.notEqual(h.persisted().branchSafety.status, 'safe');
    assert.equal(h.api.captureDiagnostics().application.status, 'rejected');
    assert.equal(h.api.operationDiagnostics()[0].persistence.status, 'saved-unowned-blocked');
}));

test('duplicate host completion events preserve the original malformed-tag failure rather than replacing it with missing-block', () => withHost(async h => {
    for (const tag of ['<npc_state_v1', '</npc_state_v1>']) {
        h.context.chat = chatFor(); h.context.chat[1].mes = visible + '\n' + tag;
        const first = await h.entry.processCompletedAssistantResponse(1);
        const second = await h.entry.processCompletedAssistantResponse(1);
        assert.equal(second.skipped, true);
        assert.deepEqual(h.api.captureDiagnostics().errorCodes, first.errorCodes);
    }
    assert.equal(h.metrics.posts, 0);
}));

test('optional completeness rejects changed preceding history between first-pass commit and its own request', () => withHost(async h => {
    h.context.chat = chatFor();
    let changed = false;
    h.context.setExtensionPrompt = () => {
        if (h.metrics.posts > 0 && !changed) { changed = true; h.context.chat[0].mes = 'Changed between first pass and completeness.'; }
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(changed, true);
    assert.equal(result.completeness, 'discarded');
    assert.equal(result.completenessResult.reason, 'source-changed-before-completeness');
    assert.equal(h.metrics.generations, 0);
}, { settings: { scanAfterEachResponse: true } }));

test('a host with a not-yet-populated active swipe slot accepts its owned message metadata, never another swipe', () => withHost(async h => {
    h.context.chat = chatFor(); h.context.chat[1].swipe_info = [];
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.api.captureDiagnostics().application.persistenceStatus, 'committed');
    assert.equal(h.api.captureDiagnostics().metadataSource, 'message');
    h.context.chat[1].swipe_id = 1;
    assert.equal(h.api.captureDiagnostics().available, false);
}));

test('lengthy narration with Inventory still captures supported facts without a supplemental request', () => withHost(async h => {
    const payload = scanOutputExamples().populated; payload.npcs = [payload.npcs[0]];
    const narration = 'Snow settles on the station roof. '.repeat(360) + visible;
    h.context.chat = chatFor(JSON.stringify(payload), narration);
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 0);
    assert.equal(h.persisted().npcs[0].appearance, 'Blue coat.');
    assert.ok(h.context.chat[1].mes.startsWith(narration));
    assert.match(h.context.chat[1].mes, /<Inventory>Coin/);
}));
'''),
]),
('tests/v077-output-contract.test.mjs', 'f467512fb5601b82cedb4e8f1bbaf69199bd3846', [
(220, 0, r'''
test('existing identity classification spelling normalization survives the stricter boundary without accepting admitted', () => {
    for (const [value, expected] of [['Named', 'named'], ['role_label', 'role-label'], [' proper ', 'named'], ['ROLE', 'role-label'], ['', '']]) {
        const parsed = strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value })));
        assert.equal(parsed.npcs[0].identityKind, expected);
    }
    for (const value of ['admitted', ' accepted ', 'constructor', '__proto__', null, 1, {}]) {
        assert.throws(() => strict(JSON.stringify(withNpc({ name: 'Nia', identityKind: value }))), /identityKind/);
    }
});
'''),
]),
])
