from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p = ROOT / path
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected one match, found {count}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

def append_before(path, marker, content):
    p = ROOT / path
    text = p.read_text()
    if marker not in text:
        raise RuntimeError(f'{path}: marker not found: {marker!r}')
    p.write_text(text.replace(marker, content + marker, 1))

# Review correction 1: the second pass already receives a stable admitted id. Do not fall back to name binding.
replace_once(
    'src/engine.js',
    "    const byId = new Map();\n    const byName = new Map();\n    for (const target of Array.isArray(targets) ? targets : []) {\n        if (!target?.npc?.id) continue;\n        const row = { npc: target.npc, allowed: new Set(target.fields || []) };\n        byId.set(target.npc.id, row);\n        const name = normalizeName(target.npc.name);\n        if (name) byName.set(name, row);\n    }",
    "    const byId = new Map();\n    for (const target of Array.isArray(targets) ? targets : []) {\n        if (!target?.npc?.id) continue;\n        byId.set(target.npc.id, { npc: target.npc, allowed: new Set(target.fields || []) });\n    }",
)
replace_once(
    'src/engine.js',
    "        const patchId = String(patch?.id || '').trim();\n        const target = byId.get(patchId) || byName.get(normalizeName(patch?.name));",
    "        const patchId = String(patch?.id || '').trim();\n        const target = byId.get(patchId);",
)

# Review correction 2: sanitized returned patches already have explicit returned-patch authority.
replace_once('src/engine.js', "                            reconcileFamilyGraph: false, allowHistoricalProfilePatches: true,\n", "                            reconcileFamilyGraph: false,\n")

# Review correction 3: avoid serializing the same compact dossier twice in the completion prompt.
replace_once(
    'src/scan-prompts.js',
    "    const rows = (Array.isArray(targets) ? targets : []).map(target => ({\n        dossier: rosterForPrompt({ npcs: [target?.npc] })[0],\n        unresolvedFields: [...new Set((Array.isArray(target?.fields) ? target.fields : []).map(value => String(value || '').trim()).filter(Boolean))],\n    })).filter(row => row.dossier?.id && row.unresolvedFields.length);",
    "    const rows = (Array.isArray(targets) ? targets : []).map(target => ({\n        id: String(target?.npc?.id || '').trim(),\n        name: String(target?.npc?.name || '').trim(),\n        unresolvedFields: [...new Set((Array.isArray(target?.fields) ? target.fields : []).map(value => String(value || '').trim()).filter(Boolean))],\n    })).filter(row => row.id && row.unresolvedFields.length);",
)

# Review correction 4: measure the admission-only completion prompt with the shared estimator/system wrapper.
replace_once(
    'scripts/measure-scan-prompts.mjs',
    "import { buildScanPrompt, buildTargetedRefreshPrompt, SCAN_SYSTEM_PROMPT } from '../src/scanner.js';",
    "import { buildFirstContactCompletionPrompt, buildScanPrompt, buildTargetedRefreshPrompt, SCAN_SYSTEM_PROMPT } from '../src/scanner.js';",
)
measurement_marker = "    {\n        const npcs = [baseNpc('vrena', 'Vrena Tolk'), baseNpc('sora', 'Sora',"
measurement_case = """    {\n        const npc = baseNpc('tessa', 'Tessa Morren', {\n            species: '', age: '', birthday: '23 Thawrise', appearanceForms: [], mannerisms: [], mood: '', goal: '', currentForm: '', memories: [], keyRelationships: [],\n            appearance: 'A young woman in a wool waistcoat and ink-stained linen sleeves.',\n            personality: 'Brisk and no-nonsense during intake.', behaviorProfile: ['Keeps intake moving rapidly.'], speech: 'Direct practical instructions.',\n            location: 'Rimecross guild desk', status: 'Processing Lucien intake paperwork.',\n        });\n        const chat = [\n            { is_user: true, name: 'Lucien Noctis', mes: 'I enter the guild and approach the young woman receptionist.' },\n            { is_user: false, mes: 'A young woman in a wool waistcoat and ink-stained linen sleeves grips your sleeve, puts a ledger before you, and says, “Name on the fifth line.” <Blocks><World_State>NPCs Present: Tessa Morren | Rimecross guild desk</World_State><NPC_Inner_Chatter>TESSA: I need this ledger closed by dusk.</NPC_Inner_Chatter></Blocks>' },\n        ];\n        cases.push(['first-contact-completion', buildFirstContactCompletionPrompt({\n            targets: [{ npc, fields: ['species', 'age', 'appearanceForms', 'mannerisms', 'mood', 'goal', 'currentForm', 'memories', 'keyRelationships'] }],\n            chat, assistantMessageId: 1, playerName: 'Lucien Noctis',\n        })]);\n    }\n"""
append_before('scripts/measure-scan-prompts.mjs', measurement_marker, measurement_case)

# Tighten tests around stable-id-only binding and prompt compaction.
replace_once(
    'tests/v0532-first-contact-completion.test.mjs',
    "    const npc = { ...state.npcs[0], id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', goal: '' };",
    "    const npc = { ...state.npcs[0], id: 'npc-tessa', name: 'Tessa Morren', role: 'Guild intake clerk', personality: 'Stored personality marker.', goal: '' };",
)
replace_once(
    'tests/v0532-first-contact-completion.test.mjs',
    "    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW \\(bounded operation evidence\\)/);\n});",
    "    assert.doesNotMatch(prompt, /OLDER REFERENCE CONTEXT|CHAT WINDOW \\(bounded operation evidence\\)/);\n    assert.equal((prompt.match(/Stored personality marker\\./g) || []).length, 1, 'target dossier should be serialized once');\n});",
)

negative_test = r'''
test('first-contact completion requires the admitted stable id and will not bind a same-name patch with a wrong id', () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async ({ prompt }) => {
        h.metrics.generations += 1;
        calls += 1;
        if (calls === 1) return JSON.stringify(firstPayload());
        assert.match(prompt, /FIRST-CONTACT COMPLETION CHECK/);
        return JSON.stringify({
            exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [],
            npcs: [{
                id: 'npc-wrong-target', name: 'Tessa Morren',
                semanticUpdates: [{ field: 'goal', operation: 'establish', value: 'Wrong-id mutation.', sources: [{ messageId: 1, excerpt: 'TESSA: I need this ledger closed by dusk.' }] }],
            }],
            socialEdges: [], familyFacts: [], lifeStateUpdates: [], candidateAccounting: {},
        });
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.ok, true);
    assert.equal(h.metrics.generations, 2);
    const admitted = h.persisted().npcs.find(row => row.name === 'Tessa Morren');
    assert.ok(admitted?.id && admitted.id !== 'npc-wrong-target');
    assert.equal(admitted.goal, '');
}), { state: createEmptyState('chat:actor.png:fixture') });

'''
append_before('tests/v0532-first-contact-completion.test.mjs', "test('completion provider failure preserves the valid first pass and reports partial instead of losing admission'", negative_test)

print('v0.5.32 review corrections staged')
