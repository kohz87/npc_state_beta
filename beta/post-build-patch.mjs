import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
const block = lines => lines.join('\n');
function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing post-build marker: ' + label);
    return source.replace(from, to);
}

let storage = read('v03/storage.js');
storage = replaceRequired(storage,
    "export const V3_FILE_FORMAT = 'npc_state_v04_beta_chat_data';",
    "export const V3_FILE_FORMAT = 'npc_state_v3_chat_data';",
    'compatible v3 payload format');
write('v03/storage.js', storage);

let engine = read('v03/engine.js');
engine = replaceRequired(engine,
    "    const getLegacyPointer = adapters.getLegacyPointer || (() => null);\n",
    "    const getLegacyPointer = adapters.getLegacyPointer || (() => null);\n    const getStablePointer = adapters.getStablePointer || (() => null);\n",
    'stable pointer adapter');
engine = replaceRequired(engine,
    "            let state;\n            let importedLegacy = false;\n",
    "            let state;\n            let importedLegacy = false;\n            let importedStable = false;\n",
    'stable import flag');

const loadStart = engine.indexOf('            } else {\n                const legacyPointer = getLegacyPointer(chatKey);');
const loadEndMarker = "            state = ensureBranchBase(normalizeState(state, chatKey), getContext().chat || []);";
const loadEnd = engine.indexOf(loadEndMarker, loadStart);
if (loadStart < 0 || loadEnd < 0) throw new Error('Missing post-build marker: load fallback clone');
const replacementFallback = block([
"            } else {",
"                const stablePointer = getStablePointer(chatKey);",
"                if (stablePointer?.path) {",
"                    const stable = await readV3Sidecar({ chatKey, pointer: stablePointer, fetchFn });",
"                    if (!stable) throw new Error('Stable NPC State sidecar pointer exists but the file is missing. Refusing to create a blank beta replacement.');",
"                    state = stable.state;",
"                    importedStable = true;",
"                } else {",
"                    const legacyPointer = getLegacyPointer(chatKey);",
"                    if (legacyPointer?.path) {",
"                        const legacy = await readLegacyV02Sidecar({ chatKey, pointer: legacyPointer, fetchFn });",
"                        if (!legacy) throw new Error('NPC State v0.2 sidecar pointer exists but the legacy file is missing. Refusing to overwrite it.');",
"                        state = legacy.state;",
"                        importedLegacy = true;",
"                    } else {",
"                        state = createEmptyState(chatKey);",
"                    }",
"                }",
"            }",
]);
engine = engine.slice(0, loadStart) + replacementFallback + '\n' + engine.slice(loadEnd);

const oldPersist = block([
"            if (importedLegacy) {",
"                state = await persist(chatKey, state);",
"                notify('success', `Imported ${state.npcs.length} NPC dossier${state.npcs.length === 1 ? '' : 's'} from v0.2 into an independent v0.3 sidecar.`);",
"            }",
]);
const newPersist = block([
"            if (importedLegacy || importedStable) {",
"                state = await persist(chatKey, state);",
"                if (importedStable) notify('success', 'Cloned stable NPC State dossiers into an independent beta sidecar. Stable data was not modified.');",
"                else notify('success', 'Imported ' + state.npcs.length + ' NPC dossier' + (state.npcs.length === 1 ? '' : 's') + ' from v0.2 into an independent beta sidecar.');",
"            }",
]);
engine = replaceRequired(engine, oldPersist, newPersist, 'persist cloned stable data');
write('v03/engine.js', engine);

let index = read('v03/index.js');
index = replaceRequired(index,
    '    getLegacyPointer,\n    persistSettings,',
    "    getLegacyPointer,\n    getStablePointer: chatKey => extension_settings?.npc_state?.v3?.dataFiles?.[chatKey] || null,\n    persistSettings,",
    'stable pointer wiring');
write('v03/index.js', index);

let readme = read('README.md');
readme += "\n## Testing beside stable NPC State\n\nDisable the stable NPC State extension while exercising this beta. Keeping both runtimes active would make stable 0.3 continue its own post-response scanner, defeating the one-generation test. The stable extension may remain installed and its settings/data remain untouched. On the beta's first load for a chat with no beta sidecar, it clones the stable v0.3 sidecar into a new beta-owned sidecar and then diverges independently.\n";
write('README.md', readme);

console.log('Applied beta stable-to-beta clone migration');
