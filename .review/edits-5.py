apply([
('CHANGELOG.md', '8fa7ea93bc7d2069c61a09cab9af7f21bcca2e87', [
(1, 0, r'''
## 0.7.7

- Replaced separate output templates with one compact response envelope and parser-tested new/existing NPC examples shared by foreground, Scan, Refresh, and recovery. Corrected the structured-import example and kept the v1 transport tag independent of contract versions.
- Reject incompatible schema drift and conflicting presence aliases before application. Report missing arrays, invalid structure, syntax errors, duplicate blocks, and truncation precisely; do not salvage arbitrary brace substrings or map foreign relationship axes.
- Bind capture diagnostics and completion deduplication to individual attempts, complete source history, chat, and swipe. Guard delayed transport cleanup against replacement content and chat switches, and capture first-pass ownership before asynchronous hydration.
- Missing or rejected captures leave NPC sidecar state unchanged and generate no fallback request unless explicitly enabled. Failure metadata remains bounded without storing failed raw output.
- Reserve selected dossier context before optional rubrics; fix zero-entry profile-evidence compaction. Preserve prior completeness, identity handoff, relationship mechanics, birthday filling, correction/rollback/recovery, storage identity, and schemas.
'''),
]),
('DEVELOPMENT.md', '74c666608f37ad8f62fb36aab11c1288246d5afe', [
(6, 1, r'''- Extension release: `0.7.7`
'''),
(9, 2, r'''- Model semantic update contract: `5`
- Foreground embedded-capture contract: `6`
'''),
(20, 0, r'''- `src/scan-contract.js`: shared response envelope, identity classifications, and literal parser-tested examples.
'''),
]),
('README.md', 'b9fc6a4380ba270a452b73109df7b633317e85c0', [
(2, 1, r'''NPC State is a SillyTavern extension that maintains durable NPC continuity while leaving narrative interpretation to the selected language model.
'''),
(4, 0, r'''## Release 0.7.7
'''),
(5, 1, r'''Foreground capture, Scan, and Refresh now share compact, literal JSON examples checked by the production parser. New dossier fields are flat; existing dossiers use semantic updates. Malformed or incompatible captures are rejected with specific reasons rather than repaired by guessing field names, relationship axes, or missing content. The existing `<npc_state_v1>` transport tag is unchanged. Successful first-pass capture adds no model request; automatic fallback, including for a missing block, runs only when explicitly enabled.
'''),
(7, 1, r'''`NPCState.captureDiagnostics(messageId?)` reports parsing, current source ownership, application, and persistence separately. Capture attempts are associated with their chat, complete history boundary, message fingerprint, and active swipe, rather than just a message position. Old, evicted, or pre-upgrade operation records cannot imply that a new capture committed. Failure details are bounded; failed raw output is not archived. `NPCState.copyCapturedPayload(messageId?)` copies an already-retained successfully parsed payload, not proof that it was applied.
'''),
(9, 1, r'''Supported first-pass appearance/profile/live state/memories and neutral Current Dynamic updates remain available, with evidence and relationship mechanics unchanged. Random birthday filling is intentional and retained. See [`docs/core-contract.md`](docs/core-contract.md) for the authoritative behavior and compatibility specification.
'''),
(11, 3, r'''Release 0.7.7 uses semantic contract 5 and foreground contract 6. Persisted state and settings schemas remain 1, and storage identity remains `npc_state_beta.v3`. No database rebuild or storage-key migration is required. Automated tests simulate the host and persistence. They do not measure live provider reliability.
'''),
(33, 8, r''''''),
]),
('docs/core-contract.md', '96b61d7b79ccbd398f088d9fb277fb8410f1ae7b', [
(68, 0, r'''### Model output structure and rejection

`src/scan-contract.js` owns the shared envelope and canonical identity classifications; ordinary field types/groups continue to derive from `src/model/dossier-fields.js`. Foreground, Scan, Refresh, structured import, and reconstruction use the same compact structural instructions and serialized fictional examples. Every example labeled valid JSON is tested through the production strict parser. Explanatory row notation is explicitly not JSON. Examples demonstrate shape, not facts or identities to copy into the story. New NPCs use an empty `id`, canonical `name`, and `identityKind` `named` or `role-label` with current-visible identity/activity evidence; the extension assigns stored IDs locally. Their ordinary bootstrap fields are flat. Existing, including name-only, dossiers keep supplied IDs and update through `semanticUpdates`.

New live responses must contain all seven arrays, including empty arrays: `exchangeActiveNpcIds`, `inChatNpcIds`, `worldActiveNpcIds`, `npcs`, `socialEdges`, `familyFacts`, and `lifeStateUpdates`. Relationship deltas use only trust/affection/desire/tension; zero values do not require a scoring event. A changed Current Dynamic needs its own bounded evidence as specified below. The v1 transport tag is independent of release/model/foreground contract versions.

Parsing and compatibility validation occur at the scanner boundary before identity preparation, not in a parallel application path. Retained compatibility is narrow: the older `finalPresentNpcIds` envelope alias must agree with `inChatNpcIds` if both are supplied; existing classification aliases proper-name/proper and role/unnamed normalize to named and role-label without conferring admission. Older direct callers may omit supplemental arrays under their established non-live parser options; the strict live path requires all seven. A complete surrounding JSON fence remains supported for older separate scanners. Supported legacy semantic shapes still pass through the existing adapter. No canonicalName/activityRefs/nested-live/relationshipToPlayer dialect is added, and no respect/attraction axis conversion is performed.

Reject incompatible/ambiguous structure as a whole, including conflicting aliases and over-cap arrays, before mutating NPC state. Ordinary per-proposal evidence and permission rejections remain explicit validator outcomes, not structural repair. Syntax errors, missing required members, invalid structures, duplicate transport blocks, unmatched tags, and truncated JSON/blocks have bounded concrete diagnostics. Do not extract an arbitrary brace substring, reconstruct incomplete JSON, or invent missing facts. A rejected capture can retain bounded error codes/messages and hashed source metadata in the host message, but does not write the NPC sidecar. Missing and invalid captures trigger a separate recovery scan only if the existing fallback option is explicitly enabled. Successful first-pass capture never requires a second model call.

Essential shape/examples stay in the mandatory foreground contract. Reserve minimum selected dossier context before optional rubrics, then enrich within the existing budget. A zero-entry compact evidence tier is empty, not an accidental slice of all historical evidence.

'''),
(133, 1, r'''`unchanged` is recorded only when an authoritative validator explicitly reports a no-change proposal or when a legacy patch explicitly records evaluated dossier groups with no field update. Modern fieldEvaluations can separately report explicit unchanged, insufficient-evidence, and context-unavailable field ids. Output omission alone is never re-labeled as confirmed evaluation. Bounded proposal diagnostics account for direct new-dossier bootstrap writes, semantic writes, Current Dynamic decisions, identity failures, validation rejection, accepted application, and missing/incomplete evaluation without double-counting the same effective field update. A present patch whose identity was rejected/unresolved is never reported merely as `missing-npc-patch`, and full prompt/chat text is not retained for this accounting. Capture metadata contains a unique attempt id, bounded transport hash, chat identity, message position/fingerprint, active swipe, and canonical history length/hash. First-pass operations carry the same attempt id and history identity. On-demand inspection matches all of these, never position/swipe alone. A failed new attempt cannot borrow an older committed outcome. Edited/replaced content, renumbering, changed preceding history, and chat/swipe switches invalidate ownership; unprocessed replacement transport also prevents an old result from appearing current. Legacy metadata without ownership and operations lost on reload/ledger eviction report application unavailable, not committed. Parsing, application, persistence, rejected/stale state, and unavailable evidence are distinct. Only already-retained successful payloads are inspectable/copyable; failed output retains bounded reasons and a hash, not raw content. There is no second payload archive.

Completion deduplication includes the canonical history boundary and transport identity, so changing only the embedded payload cannot suppress a new parse failure. Delayed transport cleanup validates the same chat/history/capture and transport hash before stripping, and asynchronous completion bookkeeping may not write to a replaced source. First-pass application captures history ownership before waiting for hydration/exclusive access and revalidates afterward.
'''),
]),
('manifest.json', '3b4f23e843363c5fc9bbab5896be05f3536e62f9', [
(9, 1, r'''    "version": "0.7.7",
'''),
]),
('tests/compatibility.test.mjs', '3c1680cc46b4f4e7849d2e5a59cfc7c1ad7384b6', [
(70, 1, r'''    assert.match(contract, /scanOutputContract/);
    assert.match(read('src/scan-helpers.js'), /DOSSIER_EVALUATION_GROUPS/);
'''),
]),
('tests/dossier-pipeline-consolidation.test.mjs', '3d3cfa0ac2df38778c1c8689ddb98992f666edae', [
(78, 2, r'''    assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 5);
    assert.equal(FOREGROUND_CONTRACT_VERSION, 6);
'''),
]),
('tests/first-pass-live-state.test.mjs', '91fa447c9f1ee7223f0ddb63a6f2406d2b68912f', [
(132, 1, r'''    assert.match(result.prompt, /FIRST-PASS LIVE STATE: mood\|location\|goal\|status\|currentForm compare supplied values/);
'''),
]),
('tests/fixtures/v077-schema-drift.json', '11df5b0632df991681624ff06a8c18fa710af397', [
(0, 0, r'''{
  "npcs": [
    {
      "id": "",
      "identityKind": "admitted",
      "canonicalName": "Vrena Holt",
      "activityRefs": ["Vrena Holt", "Vrena"],
      "species": "Human",
      "role": "Adventurer Guild intake clerk and receptionist at Rimecross Station",
      "age": 24,
      "apparentAge": 24,
      "appearance": "Mid-twenties human woman with practical auburn hair secured by a polished horn hairpin, sharp hazel eyes, ink-stained fingertips, wearing a shearling-lined wool vest over rolled homespun sleeves.",
      "personality": "Pragmatic, brisk, unsentimental, and direct. Treats Guild paperwork as a matter of logistics and community defense.",
      "speech": "Rapid, clipped, professional frontier cadence without pleasantries. Avoids conjunctions in high-efficiency work mode.",
      "mannerisms": [
        "Taps ink-stained fingers on desks",
        "Tugs visitors toward ledgers to protect floorboards"
      ],
      "live": {
        "mood": "Busy, focused, mildly impatient",
        "location": "Behind the counter, Adventurer Guild hall, Rimecross",
        "goal": "Process incoming wanderers and get local suppression contracts taken",
        "status": "Working the intake desk"
      },
      "memories": [
        "Enrolled a lone, travel-worn wanderer carrying an unadorned metal staff straight out of the high northern snows without charging an intake fee."
      ],
      "relationshipToPlayer": {
        "trust": 0,
        "affection": 0,
        "respect": 0,
        "attraction": 0
      },
      "relationshipSummary": "Sees Lucien as another rough, unwashed wanderer coming down from the heights who might be useful for clearing pests around the village perimeter."
    }
  ],
  "socialEdges": [],
  "familyFacts": [],
  "lifeStateUpdates": [],
  "exchangeActiveNpcIds": ["Vrena Holt"],
  "inChatNpcIds": ["Vrena Holt"],
  "worldActiveNpcIds": []
}
'''),
]),
('tests/foreground-injection.test.mjs', '88320fb691ca0d5568cd7ef8ef3f3494aefeaea5', [
(45, 1, r'''    assert.equal((prompt.match(/FOREGROUND CONTRACT v6/g) || []).length, 1);
'''),
]),
('tests/live-state-semantic-updates.test.mjs', '632d16b60a3efa48d1ed0cc5c53d62cd06de471b', [
(58, 2, r'''    assert.equal(NPC_STATE_MODEL_CONTRACT_VERSION, 5);
    assert.equal(FOREGROUND_CONTRACT_VERSION, 6);
'''),
]),
('tests/model-led-updates.test.mjs', '415708ed8726b5b35ffef394b9abb5852772eb8f', [
(104, 1, r'''    assert.match(prompt, /NPC STATE DOSSIER UPDATE CONTRACT v5/);
'''),
]),
('tests/relationship-summary-placeholder.test.mjs', '847d01a9aab3983577ac81f70356e10662b6b4fe', [
(135, 1, r'''        assert.match(prompt, /Changed relationshipSummary needs relationshipSummaryEvidence even at zero delta/);
'''),
]),
('tests/structure.test.mjs', '0deb581d2a28a541a70ff3d0517d54b3ebca5fa7', [
(37, 2, r'''    assert.equal(manifest.version, '0.7.7');
    assert.match(schema, /NPC_STATE_VERSION = '0\.7\.7'/);
'''),
(40, 2, r'''    assert.match(semantic, /NPC_STATE_MODEL_CONTRACT_VERSION = 5/);
    assert.match(foreground, /FOREGROUND_CONTRACT_VERSION = 6/);
'''),
]),
('tests/v075-identity-handoff.test.mjs', '2f12176b818602ec6067c5e5309ad229979c20c3', [
(363, 1, r'''    for (const phrase of ['NEW id=""', 'EXISTING/name-only: keep supplied id', '"name":"Nia","identityKind":"named"']) {
'''),
(371, 1, r'''    assert.match(built.prompt, /NEW id=""/);
'''),
(379, 2, r'''    assert.match(scan, /NEW id=""/);
    assert.match(scan, /EXISTING\/name-only: keep supplied id/);
'''),
]),
('tests/v076-first-pass-completeness.test.mjs', 'f99caf8e1b627af22d98c34574f0dac1bc65b2bd', [
(8, 1, r'''import { inspectCapturedPayload, storeCapturedPayload, summarizeProposalDiagnostics } from '../src/operation-diagnostics.js';
'''),
(308, 0, r'''    const capture = storeCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 1, consumed: { parsed: {}, raw: '{"swipe":1}', errors: [] } });
    operations[1].chatKey = 'chat:inspect';
    operations[1].source = { ...capture.source, captureId: capture.captureId };
'''),
(323, 2, r'''    const capture = storeCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 0, consumed: { parsed: {}, raw: '{"one":true}', errors: [] } });
    const stale = inspectCapturedPayload({ chat, chatKey: 'chat:inspect', messageId: 0, operations: [{ id: 'op', type: 'first-pass', chatKey: 'chat:inspect', status: 'discarded', source: { ...capture.source, captureId: capture.captureId }, persistence: { status: 'saved-unowned-blocked', revision: 4 }, failure: { reason: 'history-changed-during-persist' } }] });
'''),
]),
])
