import { uniqueStrings } from './scan-helpers.js';
import { SCAN_ARRAY_MEMBERS, SCAN_IDENTITY_KINDS } from './scan-contract.js';
import { RELATIONSHIP_AXES } from './schema.js';

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const identity = value => typeof value === 'string' && Boolean(value.trim());
const strings = value => Array.isArray(value) && value.every(identity);
// Existing classifications only. These aliases never constitute admission evidence.
const LEGACY_IDENTITY_KINDS = Object.freeze({ 'proper-name': 'named', proper: 'named', role: 'role-label', unnamed: 'role-label' });
const DRIFT_KEYS = Object.freeze({ canonicalName: 'name', activityRefs: 'activityEvidence', live: 'flat dossier fields', relationshipToPlayer: 'relationshipChange with canonical axes and evidence' });

function payloadError(code, details) {
    const issues = details.slice(0, 12).map(value => String(value).slice(0, 240));
    return Object.assign(new Error(`NPC State ${code}: ${issues.join('; ')}`), { code, issues });
}

function npcIssues(npc, index, issues) {
    const path = `npcs[${index}]`;
    if (!object(npc)) { issues.push(`${path}: expected object-with-string-identity`); return; }
    for (const field of ['id', 'name']) if (has(npc, field) && typeof npc[field] !== 'string') issues.push(`${path}.${field}: expected string`);
    if (!identity(npc.id) && !identity(npc.name) && !(Array.isArray(npc.aliases) && npc.aliases.some(identity))) {
        issues.push(`${path}: object-with-string-identity requires id or name (NEW id:"", name:"canonical name")`);
    }
    if (has(npc, 'aliases') && (!Array.isArray(npc.aliases) || !npc.aliases.every(alias => typeof alias === 'string'))) issues.push(`${path}.aliases: expected string array`);
    if (has(npc, 'identityKind') && !SCAN_IDENTITY_KINDS.includes(npc.identityKind) && !has(LEGACY_IDENTITY_KINDS, npc.identityKind)) {
        issues.push(`${path}.identityKind: expected ${SCAN_IDENTITY_KINDS.join('|')}, not ${String(npc.identityKind).slice(0, 40)}`);
    }
    for (const [field, canonical] of Object.entries(DRIFT_KEYS)) if (has(npc, field)) issues.push(`${path}.${field}: unsupported; use ${canonical}`);
    for (const field of ['semanticUpdates', 'evaluatedGroups']) if (has(npc, field) && !Array.isArray(npc[field])) issues.push(`${path}.${field}: expected array`);
    for (const field of ['identityEvidence', 'activityEvidence', 'fieldEvaluations', 'relationshipSummaryEvidence', 'relationshipChange']) {
        if (has(npc, field) && !object(npc[field])) issues.push(`${path}.${field}: expected object`);
    }
    const delta = npc.relationshipChange?.delta;
    if (delta !== undefined) {
        if (!object(delta)) issues.push(`${path}.relationshipChange.delta: expected axis object`);
        else for (const [axis, value] of Object.entries(delta)) {
            if (!RELATIONSHIP_AXES.includes(axis)) issues.push(`${path}.relationshipChange.delta.${axis}: unsupported axis (no automatic mapping)`);
            else if (typeof value !== 'number' || !Number.isFinite(value)) issues.push(`${path}.relationshipChange.delta.${axis}: expected finite number`);
        }
    }
}

export function normalizeScanPayload(parsed, { requireContract = true, allowOmittedSupplemental = false, requireLifeStateUpdates = false } = {}) {
    if (!object(parsed)) throw payloadError('wrong-root', ['JSON must be an object']);
    const presentKey = has(parsed, 'inChatNpcIds') ? 'inChatNpcIds' : 'finalPresentNpcIds';
    if (requireContract) {
        const missing = [], invalid = [];
        for (const [member, type] of Object.entries(SCAN_ARRAY_MEMBERS)) {
            const key = member === 'inChatNpcIds' ? presentKey : member;
            const required = ['exchangeActiveNpcIds', 'inChatNpcIds', 'npcs'].includes(member)
                || (['familyFacts', 'lifeStateUpdates'].includes(member) ? requireLifeStateUpdates : !allowOmittedSupplemental);
            if (!has(parsed, key)) { if (required) missing.push(`${member}: missing required array`); continue; }
            const value = parsed[key];
            if (!Array.isArray(value)) { invalid.push(`${member}: expected array, including [] when empty`); continue; }
            if (value.length > 100) invalid.push(`${member}: exceeds 100 entries; entire payload rejected`);
            if (type === 'reference' && !strings(value)) invalid.push(`${member}: expected nonempty string references`);
            if (type === 'npc') value.slice(0, 100).forEach((npc, index) => npcIssues(npc, index, invalid));
            if (type === 'object' && !value.every(object)) invalid.push(`${member}: expected objects only`);
        }
        if (has(parsed, 'inChatNpcIds') && has(parsed, 'finalPresentNpcIds')
            && JSON.stringify(parsed.inChatNpcIds) !== JSON.stringify(parsed.finalPresentNpcIds)) invalid.push('inChatNpcIds/finalPresentNpcIds: conflicting presence arrays');
        if (missing.length || invalid.length) throw payloadError(invalid.length ? 'invalid-structure' : 'missing-required-members', [...missing, ...invalid]);
    }
    return {
        exchangeActiveNpcIds: uniqueStrings(parsed.exchangeActiveNpcIds),
        finalPresentNpcIds: uniqueStrings(parsed[presentKey]),
        worldActiveNpcIds: uniqueStrings(parsed.worldActiveNpcIds),
        npcs: Array.isArray(parsed.npcs) ? parsed.npcs.slice(0, 100).map(npc => {
            if (object(npc) && has(LEGACY_IDENTITY_KINDS, npc.identityKind)) return { ...npc, identityKind: LEGACY_IDENTITY_KINDS[npc.identityKind] };
            return npc;
        }) : [],
        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.slice(0, 100) : [],
        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.slice(0, 100) : [],
        lifeStateUpdates: Array.isArray(parsed.lifeStateUpdates) ? parsed.lifeStateUpdates.slice(0, 100) : [],
    };
}

export function parseScanJson(raw, { requireLifeStateUpdates = false } = {}) {
    const text = String(raw ?? '').trim();
    if (!text) throw payloadError('empty-response', ['scanner returned no JSON']);
    // A complete surrounding JSON fence is supported for older separate scanners.
    // Never slice out braces: trailing garbage or an incomplete outer object must fail.
    const fence = /^\x60\x60\x60(?:json)?\s*\n?([\s\S]*?)\s*\x60\x60\x60$/i.exec(text);
    const body = fence ? fence[1].trim() : text;
    let parsed;
    try { parsed = JSON.parse(body); }
    catch (error) {
        const detail = String(error?.message || error);
        const position = /position (\d+)/i.exec(detail);
        const truncated = /unexpected end|unterminated string/i.test(detail) || (position && Number(position[1]) >= body.length);
        throw payloadError(truncated ? 'truncated-json' : 'json-syntax', [detail]);
    }
    return normalizeScanPayload(parsed, { requireContract: true, requireLifeStateUpdates });
}
