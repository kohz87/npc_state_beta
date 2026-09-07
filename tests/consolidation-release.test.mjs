import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { extensionSettings, normalizeSettings } from '../src/settings.js';
import { normalizeNumericSetting, numericSettingAttributes } from '../src/settings-contract.js';
import { normalizeScannerResponseTokens, createEmptyState, normalizeNpc, normalizeState, NPC_STATE_VERSION } from '../src/schema.js';
import { normalizeForegroundBudgetTokens } from '../src/foreground-budget.js';
import { normalizeStaleSettings } from '../src/stale.js';
import { relationshipMechanicsPrompt } from '../src/relationship-policy.js';
import { RELATIONSHIP_AXIS_LIMITS, RELATIONSHIP_MILESTONE_THRESHOLDS, RELATIONSHIP_MILESTONE_REQUIREMENTS, RELATIONSHIP_MILESTONE_MIN_RAW, relationshipMilestoneEventQualifies, relationshipInertiaFactor } from '../src/relationship-rules.js';
import { applyScanResult, buildScanPrompt, buildCompletenessPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt } from '../src/scanner.js';
import { createNpcStateUi } from '../src/ui.js';
import { runtimeFiles, sourceFiles } from '../scripts/runtime-files.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const payload = patch => ({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: patch ? [patch] : [], socialEdges: [], familyFacts: [], lifeStateUpdates: [] });

 test('fresh settings are independent and keep the established storage namespace', () => {
    const host = {};
    const settings = extensionSettings(host);
    assert.equal(host.npc_state_beta.v3, settings);
    assert.equal(settings.schemaVersion, 1);
    assert.equal(settings.scannerResponseTokens, 7000);
    assert.equal(settings.scanAfterEachResponse, false);
    assert.equal(settings.injectBudgetTokens, 1800);
    assert.equal(settings.relationshipHistoryLimit, 8);
    settings.dataFiles.example = { name: 'example.json' };
    settings.dossierLimits.memories = 12;
    assert.deepEqual(normalizeSettings().dataFiles, {});
    assert.equal(normalizeSettings().dossierLimits.memories, 5);
});

test('upgrade preserves custom criteria, portrait templates, routing, pointers and unknown settings', () => {
    const pointer = { name: 'existing-sidecar.json', revision: 17 };
    const host = { npc_state_beta: { v3: {
        dataFiles: { chat: pointer }, relationshipCriteria: 'Trust is earned through honesty.',
        memoryCriteria: 'Remember debts.', portraitGenerationPrompt: 'Paint {{character}}',
        scanConnectionProfileId: 'secondary', scannerResponseTokens: 15000, scanAfterEachResponse: true,
        injectDepth: 0, extensionPrivateOption: { retain: true },
    } } };
    const before = host.npc_state_beta.v3;
    const actual = extensionSettings(host);
    assert.equal(actual, before);
    assert.equal(actual.dataFiles.chat, pointer);
    assert.equal(actual.relationshipCriteria, 'Trust is earned through honesty.');
    assert.equal(actual.memoryCriteria, 'Remember debts.');
    assert.equal(actual.portraitPositivePrompt, 'Paint {{character}}');
    assert.equal(actual.scanConnectionProfileId, 'secondary');
    assert.equal(actual.scannerResponseTokens, 15000);
    assert.equal(actual.scanAfterEachResponse, true);
    assert.equal(actual.injectDepth, 0);
    assert.deepEqual(actual.extensionPrivateOption, { retain: true });
    const snapshot = structuredClone(actual);
    assert.deepEqual(extensionSettings(host), snapshot);
});

test('known historical default criteria migrate without matching edited user text', () => {
    const old = read('src/settings-migrations.js').match(/const PRE_GATE_RELATIONSHIP_CRITERIA = `([\s\S]*?)`;/)[1];
    assert.equal(normalizeSettings({ relationshipCriteria: old }).relationshipCriteria, normalizeSettings().relationshipCriteria);
    assert.equal(normalizeSettings({ relationshipCriteria: old + '\nMy campaign rule.' }).relationshipCriteria, old + '\nMy campaign rule.');
});

test('UI bounds and runtime agree for budgets, scanner limits and retention thresholds', () => {
    for (const value of [256, 1600, 1800, 8000, 9000, NaN, Infinity, '', null]) {
        assert.equal(normalizeSettings({ injectBudgetTokens: value }).injectBudgetTokens, normalizeForegroundBudgetTokens(value));
    }
    assert.match(numericSettingAttributes('injectBudgetTokens'), /min="1600" max="8000"/);
    for (const value of [0, 1, 512, 7000, 15000, 15001, NaN, Infinity]) {
        assert.equal(normalizeScannerResponseTokens(value), normalizeNumericSetting('scannerResponseTokens', value));
    }
    const input = { staleArchiveAfter: 9999, staleDeleteAfter: 2 };
    const settings = normalizeSettings(input);
    const retention = normalizeStaleSettings(settings);
    assert.equal(settings.staleDeleteAfter, 10000);
    assert.equal(retention.deleteAfter, settings.staleDeleteAfter);
});

test('prompt mechanics match every gate and custom cap used by runtime', () => {
    const caps = { ordinary: 0.5, meaningful: 4, major: 7, extreme: 12 };
    const prompt = relationshipMechanicsPrompt(caps);
    for (const [tier, cap] of Object.entries(caps)) {
        assert.ok(prompt.includes(`${tier}: at most ${cap} raw points per supported axis, at most ${RELATIONSHIP_AXIS_LIMITS[tier]} supported axes`));
    }
    for (const threshold of RELATIONSHIP_MILESTONE_THRESHOLDS) {
        const impact = RELATIONSHIP_MILESTONE_REQUIREMENTS[threshold];
        const raw = RELATIONSHIP_MILESTONE_MIN_RAW[threshold];
        assert.ok(prompt.includes(`${threshold} needs ${impact}+ with raw ${raw}`));
        for (const sign of [-1, 1]) {
            assert.equal(relationshipMilestoneEventQualifies({ impact, delta: { trust: sign * raw } }, 'trust', threshold), true);
            assert.equal(relationshipMilestoneEventQualifies({ impact, delta: { trust: sign * (raw - 0.1) } }, 'trust', threshold), false);
        }
    }
    assert.equal(relationshipInertiaFactor(25, 2), 1);
    assert.equal(relationshipInertiaFactor(26, 2), 0.8);
    assert.equal(relationshipInertiaFactor(-76, -2), 0.4);
    assert.equal(relationshipInertiaFactor(91, -5, 'extreme'), 1);
});

test('all separate generation modes emit one semantic contract without legacy output shapes', () => {
    const state = createEmptyState('chat');
    const npc = normalizeNpc({ id: 'npc-mira', name: 'Mira Holt', present: true, age: '6', birthday: '14 Frostwane' });
    state.npcs = [npc];
    const chat = [{ is_user: true, mes: 'Happy birthday Mira.' }, { is_user: false, mes: 'Mira turned 7 today.' }];
    const args = { state, npc, chat, assistantMessageId: 1, blocks: [{ messageId: 1, body: 'Mira is seven.' }] };
    for (const build of [buildScanPrompt, buildCompletenessPrompt, buildTargetedRefreshPrompt, buildStructuredDossierImportPrompt]) {
        const prompt = build(args);
        assert.equal(prompt.split('NPC STATE DOSSIER UPDATE CONTRACT v').length - 1, 1, build.name);
        assert.doesNotMatch(prompt, /ageChange is the only|Use ageChange instead|COMPLETE authoritative replacement set/);
        const output = JSON.parse(prompt.match(/OUTPUT CONTRACT:\s*(\{[^\n]+\})/)[1]);
        for (const patch of output.npcs) {
            for (const key of ['ageChange', 'ageProgression', 'profileChanges', 'canonChanges', 'appearanceFormChanges', 'keyRelationshipChanges']) assert.equal(Object.hasOwn(patch, key), false, `${build.name}: ${key}`);
            assert.deepEqual(patch.semanticUpdates, []);
        }
        assert.ok(prompt.includes('ageKind birthday|elapsed|correction'));
    }
});

test('legacy age responses still use compatibility adapter and respect manual locks', () => {
    const state = createEmptyState('upgrade');
    state.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', age: '6', personality: 'Reserved', manualProfileFields: ['personality'] })];
    const evidence = 'Mira turned 7 today.';
    const result = applyScanResult(state, payload({ id: 'npc-mira', name: 'Mira', ageChange: { age: '7', kind: 'birthday', evidence }, semanticUpdates: [{ field: 'personality', operation: 'replace', value: 'Outgoing', sources: [{ messageId: 1, excerpt: evidence }] }] }), { sourceMessageId: 1, applyReturnedNpcPatches: true, profileContext: evidence, applyRelationship: false });
    assert.equal(result.state.npcs[0].age, '7');
    assert.equal(result.state.npcs[0].personality, 'Reserved');
    const reload = normalizeState(JSON.parse(JSON.stringify(result.state)), 'upgrade');
    assert.equal(reload.schemaVersion, 1);
    assert.equal(reload.appVersion, NPC_STATE_VERSION);
    assert.equal(reload.npcs[0].age, '7');
});

test('lifecycle short-name binding survives extraction and rejects ambiguous identities', () => {
    const state = createEmptyState('lifecycle');
    const mira = normalizeNpc({ id: 'npc-mira', name: 'Mira Holt', lifeState: 'alive' });
    state.npcs = [mira];
    const evidence = 'Mira died protecting the bridge.';
    const input = payload();
    input.lifeStateUpdates.push({ id: mira.id, lifeState: 'dead', lifeStateCertainty: 'explicit', lifeStateReason: evidence });
    const options = { sourceMessageId: 1, profileContext: evidence, applyReturnedNpcPatches: true, applyRelationship: false };
    const accepted = applyScanResult(state, input, options);
    assert.equal(accepted.state.npcs[0].lifeState, 'dead');
    state.npcs.push(normalizeNpc({ id: 'npc-other', name: 'Mira West', lifeState: 'alive' }));
    const rejected = applyScanResult(state, input, options);
    assert.equal(rejected.state.npcs[0].lifeState, 'alive');
});

test('editor mount retains click/save listeners and supports popover and ordinary overlays', () => {
    const previous = globalThis.document;
    const npc = normalizeNpc({ id: 'npc-mira', name: 'Mira' });
    try {
        for (const supported of [true, false]) {
            let mounted = null;
            const saveButton = { addEventListener(type, callback) { this[type] = callback; } };
            const doc = {
                getElementById: () => mounted,
                body: { appendChild(node) { mounted = node; } },
                createElement() { return {
                    dataset: {}, attributes: {}, listeners: {},
                    addEventListener(type, fn) { this.listeners[type] = fn; },
                    querySelector: () => saveButton,
                    setAttribute(name, value) { this.attributes[name] = value; },
                    removeAttribute(name) { delete this.attributes[name]; },
                    matches: () => false,
                    remove() { mounted = null; },
                    ...(supported ? { showPopover() { this.shown = true; } } : {}),
                }; },
            };
            globalThis.document = doc;
            const ui = createNpcStateUi({ engine: { getDossierNpc: () => npc }, getChatKey: () => 'chat', getSettings: () => normalizeSettings() });
            assert.equal(ui.openEditor(npc.id), true);
            assert.equal(ui.activeEditorNpcId, npc.id);
            assert.equal(typeof mounted.listeners.click, 'function');
            assert.equal(typeof saveButton.click, 'function');
            assert.equal(mounted.shown === true, supported);
            ui.closeEditor();
            assert.equal(mounted, null);
        }
    } finally { globalThis.document = previous; }
});

test('every source file is reachable and missing dependencies fail before release', () => {
    const files = runtimeFiles(root);
    assert.deepEqual(sourceFiles(root).filter(file => !files.includes(file)), []);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-deps-'));
    try {
        fs.writeFileSync(path.join(temp, 'manifest.json'), JSON.stringify({ js: 'bootstrap.js' }));
        fs.writeFileSync(path.join(temp, 'bootstrap.js'), "await import('./missing.js');");
        assert.throws(() => runtimeFiles(temp), /Missing runtime dependency/);
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});

test('compressed release contains complete runtime with byte-identical extracted sources', () => {
    const packed = spawnSync(process.execPath, ['scripts/package.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const zip = fs.readFileSync(path.join(root, 'dist', `npc_state_beta-${NPC_STATE_VERSION}.zip`));
    const entries = new Map();
    let offset = 0;
    while (zip.readUInt32LE(offset) === 0x04034b50) {
        assert.equal(zip.readUInt16LE(offset + 8), 8);
        const size = zip.readUInt32LE(offset + 18);
        const nameLength = zip.readUInt16LE(offset + 26);
        const extraLength = zip.readUInt16LE(offset + 28);
        const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString().split('/').slice(1).join('/');
        const start = offset + 30 + nameLength + extraLength;
        entries.set(name, inflateRawSync(zip.subarray(start, start + size)));
        offset = start + size;
    }
    assert.deepEqual([...entries.keys()].sort(), ['manifest.json', 'LICENSE', 'README.md', ...runtimeFiles(root)].sort());
    for (const [file, bytes] of entries) assert.deepEqual(bytes, fs.readFileSync(path.join(root, file)), file);
    assert.equal([...entries.keys()].some(file => /^(tests|scripts|docs)\//.test(file)), false);
});

test('fresh and upgraded packages load the public API at the SillyTavern import depth', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-install-'));
    try {
        const scripts = path.join(temp, 'public', 'scripts');
        const extension = path.join(scripts, 'extensions', 'third-party', 'npc_state_beta');
        fs.mkdirSync(extension, { recursive: true });
        fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
        for (const file of runtimeFiles(root)) {
            const target = path.join(extension, file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.copyFileSync(path.join(root, file), target);
        }
        fs.writeFileSync(path.join(temp, 'public', 'script.js'), 'export const extension_prompt_types = {}; export const extension_prompt_roles = {}; export const getRequestHeaders = () => ({});');
        fs.writeFileSync(path.join(scripts, 'extensions.js'), 'export const extension_settings = JSON.parse(process.env.NPC_TEST_SETTINGS || "{}"); export const getContext = () => ({ chat: [], characters: [], eventTypes: {} });');
        fs.writeFileSync(path.join(temp, 'load.mjs'), `
            import assert from 'node:assert/strict';
            globalThis.document = { readyState: 'loading', body: null, addEventListener() {}, querySelector() { return null; }, getElementById() { return null; }, createElement() { return { dataset: {} }; }, head: { appendChild() {} } };
            await import('./public/scripts/extensions/third-party/npc_state_beta/bootstrap.js');
            assert.equal(globalThis.NPCState.version, '${NPC_STATE_VERSION}');
            assert.equal(globalThis.NPCState.settings().schemaVersion, 1);
            assert.equal(globalThis.NPCState.debugStatus().admissionMode, 'balanced');
            assert.equal(globalThis.NPCState.scanMetrics().npcCount, 0);
            assert.equal(typeof globalThis.NPCState.operationDiagnostics, 'function');
            for (const key of ['scan', 'refreshFromChat', 'portraitPrompts', 'previewBundleImport', 'resumeRebuild', 'previewRebase']) assert.equal(typeof globalThis.NPCState[key], 'function');
            if (process.env.NPC_TEST_SETTINGS) {
                assert.equal(globalThis.NPCState.settings().scanConnectionProfileId, 'secondary');
                assert.equal(globalThis.NPCState.settings().portraitPositivePrompt, 'My {{character}}');
                assert.equal(globalThis.NPCState.settings().dataFiles.chat.name, 'saved.json');
            }
        `);
        for (const saved of [{}, { npc_state_beta: { v3: { scanConnectionProfileId: 'secondary', portraitGenerationPrompt: 'My {{character}}', dataFiles: { chat: { name: 'saved.json' } } } } }]) {
            const result = spawnSync(process.execPath, ['load.mjs'], { cwd: temp, encoding: 'utf8', env: { ...process.env, ...(saved.npc_state_beta ? { NPC_TEST_SETTINGS: JSON.stringify(saved) } : {}) }, timeout: 10000 });
            assert.equal(result.status, 0, result.stderr || result.stdout);
        }
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
