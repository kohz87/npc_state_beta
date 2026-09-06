import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateWithScanRoute, resolveScanGenerationRoute, scanConnectionProfileOptions } from '../v03/scan-connection.js';

const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
const indexSource = fs.readFileSync('v03/index.js', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const settingsLayoutSource = fs.readFileSync('v03/settings-layout.js', 'utf8');
const connectionSource = fs.readFileSync('v03/scan-connection.js', 'utf8');

assert(indexSource.includes("scanConnectionProfileId: ''"), 'Default scan profile must be Current connection');
assert(indexSource.includes('scanAfterEachResponse: false'), 'Post-response completeness must default off');
assert(indexSource.includes('resolveGenerationRoute: resolveNpcScanRoute'), 'Engine must receive the scan route resolver');
assert(uiSource.includes('NPC scan connection profile'), 'Scan profile setting UI missing');
assert(uiSource.includes('Scan after each response'), 'Completeness toggle UI missing');
assert(uiSource.includes('normal roleplay and embedded NPC output stay on your main connection'), 'UI must explain main-roleplay isolation');
assert(uiSource.includes('plus a JSON retry if needed'), 'UI must explain completeness request cost');
assert(settingsLayoutSource.includes("'#npc_state_v3_scan_profile'"), 'Profile setting must remain inside Scanning');
assert(settingsLayoutSource.includes("'#npc_state_v3_scan_after_response'"), 'Completeness setting must remain inside Scanning');
assert(engineSource.includes('const route = await resolveGenerationRoute({ label });'), 'JSON operations must snapshot one generation route');
assert(engineSource.includes('label: `${label}-json-retry`,\n                route,'), 'JSON retry must reuse the captured route');
assert(engineSource.includes("invokeJson(prompt, manual ? 'manual-current-cast' : 'automatic-current-cast')"), 'Current-cast scans must use central routed JSON invocation');
assert(engineSource.includes("invokeJson(prompt, 'structured-import-' + npc.id)"), 'Structured imports must use central routed JSON invocation');
assert(engineSource.includes('invokeJson(prompt, `targeted-${npc.id}`)'), 'Dossier refresh must use central routed JSON invocation');
assert(engineSource.includes("invokeJson(prompt, 'historical-recovery-' + nextMessageId)"), 'Historical rebuild must use central routed JSON invocation');
assert(engineSource.includes("invokeJson(prompt, 'automatic-completeness')"), 'Completeness pass must use central routed JSON invocation');
assert.equal((engineSource.match(/await generate\(/g) || []).length, 2, 'Separate model calls must stay centralized in invokeJson first request + retry');
assert(!connectionSource.includes('apiKey'), 'NPC State must not duplicate API keys in its profile integration');

{
    let mainCalls = 0;
    const profile = { id: 'scan-profile-1', name: 'Scanner Mini', api: 'openai', model: 'scanner-model', 'secret-id': 'credential-ref' };
    const calls = [];
    const service = {
        getSupportedProfiles: () => [profile],
        getProfile: id => id === profile.id ? profile : null,
        validateProfile: value => { if (!value?.api) throw new Error('bad profile'); },
        async sendRequest(profileId, messages, maxTokens, custom) {
            calls.push({ profileId, messages, maxTokens, custom });
            return { content: '{"routed":true}', reasoning: 'reasoning must not reach JSON parser input' };
        },
    };
    const context = { ConnectionManagerRequestService: service, generateRaw: async () => { mainCalls += 1; return 'main'; } };
    const getContext = () => context;
    const listed = scanConnectionProfileOptions(getContext);
    assert.equal(listed.available, true);
    assert.deepEqual(listed.profiles, [{ id: profile.id, name: profile.name }]);
    const route = resolveScanGenerationRoute(getContext, profile.id);
    const text = await generateWithScanRoute({ getContext, route, systemPrompt: 'SYSTEM', prompt: 'USER', responseLength: 9123 });
    assert.equal(text, '{"routed":true}');
    assert.equal(mainCalls, 0, 'Selected alternate profile silently used the main connection');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].profileId, profile.id);
    assert.equal(calls[0].maxTokens, 9123, 'Scanner response-token limit was not forwarded');
    assert.deepEqual(calls[0].messages, [{ role: 'system', content: 'SYSTEM' }, { role: 'user', content: 'USER' }]);
    assert.equal(calls[0].custom.stream, false);
    assert.equal(calls[0].custom.extractData, true);
    assert.equal(calls[0].custom.includePreset, true);
    assert.equal(calls[0].custom.includeInstruct, true);

    profile.model = 'changed-mid-operation';
    await assert.rejects(
        () => generateWithScanRoute({ getContext, route, systemPrompt: 'SYSTEM', prompt: 'USER', responseLength: 9123 }),
        error => error?.code === 'NPC_STATE_SCAN_PROFILE_CHANGED',
        'A retry must not silently mix a changed profile configuration',
    );
    assert.equal(mainCalls, 0);
}

{
    let mainCalls = 0;
    const currentContext = { generateRaw: async ({ prompt }) => { mainCalls += 1; return 'main:' + prompt; } };
    const currentRoute = resolveScanGenerationRoute(() => currentContext, '');
    assert.deepEqual(currentRoute, { kind: 'current' });
    assert.equal(await generateWithScanRoute({ getContext: () => currentContext, route: currentRoute, systemPrompt: 's', prompt: 'p', responseLength: 20 }), 'main:p');
    assert.equal(mainCalls, 1);
    const unavailable = scanConnectionProfileOptions(() => currentContext);
    assert.equal(unavailable.available, false);
    assert.throws(
        () => resolveScanGenerationRoute(() => ({ ConnectionManagerRequestService: {
            getSupportedProfiles: () => [], getProfile: () => null, sendRequest: async () => ({}), validateProfile: () => {},
        } }), 'deleted-profile'),
        error => error?.code === 'NPC_STATE_SCAN_PROFILE_MISSING',
    );
    assert.equal(mainCalls, 1, 'Missing alternate profile must never fall back to main generation');
}

console.log('PASS v0.4.42 scan profile routing');
