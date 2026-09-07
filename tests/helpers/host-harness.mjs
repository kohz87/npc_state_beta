import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createEmptyState } from '../../src/schema.js';
import { encodeV3Payload, decodeV3Payload } from '../../src/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Real entrypoint/engine/sidecar code at the host's actual import depth. Only host
// APIs and persistence are simulated; no deployment or user files are consulted.
export async function withHost(run, { sourceRoot = root, state = null, settings = {} } = {}) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-capture-host-'));
    const extension = path.join(temp, 'public/scripts/extensions/third-party/npc_state_beta');
    fs.mkdirSync(extension, { recursive: true });
    fs.cpSync(path.join(sourceRoot, 'src'), path.join(extension, 'src'), { recursive: true });
    fs.writeFileSync(path.join(temp, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(temp, 'public/script.js'), 'export const extension_prompt_types = {}; export const extension_prompt_roles = {}; export const getRequestHeaders = () => ({});');
    fs.writeFileSync(path.join(temp, 'public/scripts/extensions.js'), 'export const extension_settings = globalThis.__npcHost.settings; export const getContext = () => globalThis.__npcHost.context;');
    const key = 'chat:actor.png:fixture';
    const initial = state || createEmptyState(key);
    initial.chatKey = key;
    initial.branchSafety = { status: 'safe' };
    let saved = encodeV3Payload(key, initial, 1);
    const metrics = { posts: 0, reads: 0, generations: 0, chatSaves: 0, renders: 0, notices: [] };
    const host = {
        key, metrics, beforeRead: null, beforeWrite: null,
        settings: { npc_state_beta: { v3: { enabled: true, autoScan: true, fallbackScan: false, scanAfterEachResponse: false, branchRescan: false, birthdayFillMode: 'off',
            dataFiles: { [key]: { name: 'fixture.json', path: '/files/fixture.json', revision: 1 } }, ...settings } } },
        context: { chatId: 'fixture', characterId: 0, characters: [{ avatar: 'actor.png' }], name1: 'Ari', eventTypes: {}, chat: [],
            saveChat() { metrics.chatSaves += 1; }, saveSettingsDebounced() {}, setExtensionPrompt() {},
            updateMessageBlock() { metrics.renders += 1; },
            async generateRaw() { metrics.generations += 1; throw new Error('Unexpected provider request'); },
        },
        persisted: () => decodeV3Payload(saved, key).state,
    };
    const previous = Object.fromEntries(['__npcHost', 'document', 'fetch', 'NPCState', 'toastr', 'setTimeout', 'setInterval'].map(key => [key, globalThis[key]]));
    const timers = new Set();
    for (const name of ['setTimeout', 'setInterval']) globalThis[name] = (...args) => {
        const handle = previous[name](...args); timers.add(handle); return handle;
    };
    globalThis.__npcHost = host;
    globalThis.document = { readyState: 'loading', body: null, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return { dataset: {}, classList: { add() {} } }; }, head: { appendChild() {} } };
    globalThis.toastr = Object.fromEntries(['warning', 'error', 'info', 'success'].map(kind => [kind, text => metrics.notices.push({ kind, text })]));
    globalThis.fetch = async (url, options = {}) => {
        if (options.method === 'POST') {
            metrics.posts += 1;
            await host.beforeWrite?.();
            saved = Buffer.from(JSON.parse(options.body).data, 'base64').toString('utf8');
            return { ok: true, json: async () => ({ path: '/files/fixture.json' }) };
        }
        metrics.reads += 1;
        await host.beforeRead?.();
        return { ok: true, text: async () => saved };
    };
    try {
        host.entry = await import(pathToFileURL(path.join(extension, 'src/index.js')));
        host.api = globalThis.NPCState;
        return await run(host);
    } finally {
        // Drain bounded host callbacks before restoring globals for the next fixture.
        await new Promise(resolve => setTimeout(resolve, 310));
        for (const timer of timers) { clearTimeout(timer); clearInterval(timer); }
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
        }
        fs.rmSync(temp, { recursive: true, force: true });
    }
}
