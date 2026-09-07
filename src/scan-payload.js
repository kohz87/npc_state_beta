import { uniqueStrings } from './scan-helpers.js';

function isPlainScannerObject(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function scannerStringArrayValid(value) {
    return Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
}

function scannerObjectArrayValid(value) {
    return Array.isArray(value) && value.every(isPlainScannerObject);
}

function scannerIdentityString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}

function scannerNpcArrayValid(value) {
    return scannerObjectArrayValid(value) && value.every(item => {
        const has = key => Object.prototype.hasOwnProperty.call(item, key);
        if (has('id') && typeof item.id !== 'string') return false;
        if (has('name') && typeof item.name !== 'string') return false;
        if (has('aliases') && (!Array.isArray(item.aliases) || !item.aliases.every(alias => typeof alias === 'string'))) return false;
        const direct = scannerIdentityString(item.id) || scannerIdentityString(item.name);
        const alias = Array.isArray(item.aliases) && item.aliases.some(scannerIdentityString);
        return Boolean(direct || alias);
    });
}

export function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false, requireLifeStateUpdates = false } = {}) {
    if (!isPlainScannerObject(parsed)) throw new Error('NPC State recovery scanner JSON must be an object.');
    const has = key => Object.prototype.hasOwnProperty.call(parsed, key);
    const presentKey = has('inChatNpcIds') ? 'inChatNpcIds' : (has('finalPresentNpcIds') ? 'finalPresentNpcIds' : '');
    if (requireContract) {
        const invalid = [];
        if (!scannerStringArrayValid(parsed.exchangeActiveNpcIds)) invalid.push('exchangeActiveNpcIds[string]');
        if (!presentKey || !scannerStringArrayValid(parsed[presentKey])) invalid.push('inChatNpcIds[string]');
        if ((!allowOmittedSupplemental || has('worldActiveNpcIds')) && !scannerStringArrayValid(parsed.worldActiveNpcIds)) invalid.push('worldActiveNpcIds[string]');
        if (!scannerNpcArrayValid(parsed.npcs)) invalid.push('npcs[object-with-string-identity]');
        if ((!allowOmittedSupplemental || has('socialEdges')) && !scannerObjectArrayValid(parsed.socialEdges)) invalid.push('socialEdges[object]');
        if (has('familyFacts') && !scannerObjectArrayValid(parsed.familyFacts)) invalid.push('familyFacts[object]');
        // live model consumers opt into mandatory lifecycle evaluation while the public parser stays fixture-compatible.
        if ((requireLifeStateUpdates || has('lifeStateUpdates')) && !scannerObjectArrayValid(parsed.lifeStateUpdates)) invalid.push('lifeStateUpdates[object]');
        if (invalid.length) throw new Error('NPC State recovery scanner JSON has invalid payload structure or members: ' + invalid.join(', ') + '.');
    }
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed.inChatNpcIds ?? parsed.finalPresentNpcIds),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 100) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],
        lifeStateUpdates: Array.isArray(parsed.lifeStateUpdates) ? parsed.lifeStateUpdates.slice(0, 100) : [],
    };
}

export function parseScanJson(raw, { requireLifeStateUpdates = false } = {}) {
    const text = String(raw ?? '').trim();
    if (!text) throw new Error('NPC State recovery scanner returned an empty response.');
    const unfenced = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/i, '').trim();
    const first = unfenced.indexOf('{');
    const last = unfenced.lastIndexOf('}');
    if (first < 0 || last <= first) throw new Error('NPC State recovery scanner returned no JSON object.');
    let parsed;
    try { parsed = JSON.parse(unfenced.slice(first, last + 1)); }
    catch (error) { throw new Error('NPC State recovery scanner returned malformed JSON: ' + error.message); }
    return normalizeScanPayload(parsed, { requireContract: true, requireLifeStateUpdates });
}
