import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing phase-4 marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Schema: enrich graph provenance and add bounded unresolved/countable family slots.
// ---------------------------------------------------------------------------
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export const PROFILE_EVOLUTION_EVIDENCE_LIMIT = 12;\n",
    "export const PROFILE_EVOLUTION_EVIDENCE_LIMIT = 12;\nexport const FAMILY_SLOT_LIMIT = 100;\n",
    'family slot limit',
);
schema = replaceRequired(
    schema,
    "            sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,\n        });",
    "            sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,\n            provenance: ['manual', 'explicit', 'strong-context', 'migration', 'inferred'].includes(String(raw?.provenance)) ? String(raw.provenance) : 'explicit',\n            confidence: Number.isFinite(Number(raw?.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,\n            inferred: raw?.inferred === true,\n        });",
    'social edge provenance',
);
schema = replaceRequired(
    schema,
    "export function normalizeName(value) {",
    `export function normalizeFamilySlots(value = [], validNpcIds = null) {
    const valid = validNpcIds instanceof Set ? validNpcIds : null;
    const source = Array.isArray(value) ? value : [];
    const out = [];
    const seen = new Set();
    for (const raw of source) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const ownerId = text(raw.ownerId, 160);
        const relation = text(raw.relation, 120);
        if (!ownerId || !relation || (valid && !valid.has(ownerId))) continue;
        const count = Math.max(1, Math.min(20, Math.round(Number(raw.count) || 1)));
        const descriptor = text(raw.descriptor, 240);
        const twinGroup = text(raw.twinGroup, 160);
        const id = text(raw.id, 260) || ('family:' + ownerId + ':' + normalizeName(relation).replace(/\\s+/g, '_') + ':' + normalizeName(twinGroup || descriptor).replace(/\\s+/g, '_'));
        if (seen.has(id)) continue;
        seen.add(id);
        const resolvedNpcIds = list(raw.resolvedNpcIds, count, 160).filter(item => item !== ownerId && (!valid || valid.has(item))).slice(0, count);
        out.push({
            id,
            ownerId,
            relation,
            count,
            resolvedNpcIds,
            descriptor,
            twinGroup,
            evidence: text(raw.evidence, 600),
            provenance: ['manual', 'explicit', 'strong-context', 'migration', 'inferred'].includes(String(raw.provenance)) ? String(raw.provenance) : 'explicit',
            confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(1, Number(raw.confidence))) : 1,
            sourceMessageId: Number.isInteger(raw.sourceMessageId) ? raw.sourceMessageId : null,
            updatedAt: Number(raw.updatedAt) || Date.now(),
        });
        if (out.length >= FAMILY_SLOT_LIMIT) break;
    }
    return out;
}

export function normalizeName(value) {`,
    'family slot normalizer',
);
schema = replaceRequired(
    schema,
    "        socialGraph: [],\n        suppressedNames:",
    "        socialGraph: [],\n        familySlots: [],\n        suppressedNames:",
    'empty family slots',
);
schema = replaceRequired(
    schema,
    "    const suppressedNames = list(input.suppressedNames || input.dismissed, 300, 160);",
    "    const validNpcIds = new Set([...dedup.values()].map(npc => npc.id));\n    const familySlots = normalizeFamilySlots(input.familySlots, validNpcIds);\n    const suppressedNames = list(input.suppressedNames || input.dismissed, 300, 160);",
    'normalize family slots',
);
schema = replaceRequired(
    schema,
    "        socialGraph: normalizeSocialEdges(input.socialGraph),\n        suppressedNames,",
    "        socialGraph: normalizeSocialEdges(input.socialGraph),\n        familySlots,\n        suppressedNames,",
    'stored family slots',
);
write('v03/schema.js', schema);

// ---------------------------------------------------------------------------
// Scanner: counterpart-safe key relationship merge, explicit removals, countable family
// facts, partial slot resolution, and conservative sibling/twin inference.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    normalizeDossierLimits,\n    normalizeKeyRelationshipEntries,",
    "    normalizeDossierLimits,\n    normalizeFamilySlots,\n    normalizeKeyRelationshipEntries,",
    'family slot scanner import',
);
scanner = replaceRequired(
    scanner,
    "        '- behaviorProfile, mannerisms, keyRelationships, and memories are EVOLVING CURATED COLLECTIONS, not append-only logs.',\n        '- For each evolving collection, use null when nothing materially changed and the existing collection should be preserved exactly.',\n        '- When an evolving collection needs revision, return an array containing the COMPLETE authoritative replacement set, not only additions.',",
    "        '- behaviorProfile, mannerisms, and memories are EVOLVING CURATED COLLECTIONS. Use null when unchanged; when revised, return the COMPLETE authoritative replacement set.',\n        '- keyRelationships is counterpart-merge continuity, not a fragile whole-list replacement. Use null when unchanged. When a tie is newly established or materially revised, return only the affected canonical Other NPC - relationship entries; NPC State preserves omitted still-valid ties locally. Use keyRelationshipChanges only for an explicit supported removal.',",
    'collection relationship merge semantics',
);
scanner = replaceRequired(
    scanner,
    "        '- A replacement array may rewrite, merge, retire, reorder, or displace older entries as the NPC grows and canon changes. Preserve still-relevant durable facts from EXISTING DOSSIERS even when the current exchange does not repeat them.',",
    "        '- Replacement-array behavior applies to behaviorProfile, mannerisms, and memories. Key relationships instead merge by named counterpart so omission cannot silently erase family/friend/guardian continuity.',",
    'replacement semantics exclusion',
);
scanner = replaceRequired(
    scanner,
    "        '- Use [] only when the evidence supports deliberately clearing the whole collection. Do not clear a collection merely because the supplied chat window does not mention its existing entries.',",
    "        '- For behaviorProfile, mannerisms, and memories, use [] only when evidence supports deliberately clearing the whole collection. For keyRelationships, [] means no relationship additions/changes; it never clears existing ties.',",
    'empty relationship semantics',
);
scanner = replaceRequired(
    scanner,
    "For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',",
    "For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the affected counterpart entry; omitted existing counterparts are preserved by NPC State. Remove an established tie only through keyRelationshipChanges with action remove and explicit evidence.',",
    'significant tie merge semantics',
);
scanner = replaceRequired(
    scanner,
    "            behaviorProfile: [], speech: '', mannerisms: [], profileChanges:",
    "            behaviorProfile: [], speech: '', mannerisms: [], keyRelationshipChanges: [{ other: 'existing NPC name/id', action: 'remove', evidence: 'explicit evidence the durable tie no longer applies' }], profileChanges:",
    'full scanner key relationship changes contract',
);
scanner = replaceRequired(
    scanner,
    "        socialEdges: [{ from: 'NPC id/name only', to: 'NPC id/name only', relation: '', summary: '' }],\n    };",
    "        socialEdges: [{ from: 'NPC id/name only', to: 'NPC id/name only', relation: '', summary: '', provenance: 'explicit|strong-context' }],\n        familyFacts: [{ owner: 'existing NPC id/name', relation: 'daughter|son|child|other countable family role', count: 2, descriptor: 'optional e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit countable family fact' }],\n    };",
    'full scanner family facts contract',
);
scanner = replaceRequired(
    scanner,
    "        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.filter(item => item && typeof item === 'object').slice(0, 100) : [],\n    };",
    "        socialEdges: Array.isArray(parsed.socialEdges) ? parsed.socialEdges.filter(item => item && typeof item === 'object').slice(0, 100) : [],\n        familyFacts: Array.isArray(parsed.familyFacts) ? parsed.familyFacts.filter(item => item && typeof item === 'object').slice(0, 100) : [],\n    };",
    'parse family facts',
);
scanner = replaceRequired(
    scanner,
    "function applyStablePatch(npc, patch, options = {}) {",
    `function keyRelationshipParts(entry) {
    const clean = String(entry || '').trim();
    const match = clean.match(/^(.+?)\\s+(?:-|–|—)\\s+(.+)$/);
    if (!match) return { other: '', relation: clean };
    return { other: match[1].trim(), relation: match[2].trim() };
}

function keyRelationshipOtherKey(entry) {
    return normalizeName(keyRelationshipParts(entry).other);
}

function mergeKeyRelationshipPatch(existingValue, incomingValue, changesValue, limit) {
    const out = normalizeKeyRelationshipEntries(existingValue, Math.max(limit, 30), 500);
    const indexFor = () => new Map(out.map((entry, index) => [keyRelationshipOtherKey(entry), index]).filter(([key]) => key));
    let indices = indexFor();
    for (const entry of normalizeKeyRelationshipEntries(incomingValue, limit, 500)) {
        const key = keyRelationshipOtherKey(entry);
        if (key && indices.has(key)) out[indices.get(key)] = entry;
        else if (!out.some(item => normalizeName(item) === normalizeName(entry))) out.push(entry);
        indices = indexFor();
    }
    for (const raw of Array.isArray(changesValue) ? changesValue : []) {
        if (!raw || typeof raw !== 'object' || String(raw.action || '').trim() !== 'remove') continue;
        const evidence = String(raw.evidence || raw.reason || '').trim();
        const key = normalizeName(raw.other || raw.name || raw.target);
        if (!evidence || !key) continue;
        for (let i = out.length - 1; i >= 0; i -= 1) if (keyRelationshipOtherKey(out[i]) === key) out.splice(i, 1);
    }
    return normalizeKeyRelationshipEntries(out, limit, 500);
}

const FAMILY_CHILD_ROLES = new Set(['child', 'daughter', 'son', 'adopted child', 'stepchild']);
const FAMILY_PARENT_ROLES = new Set(['parent', 'mother', 'father', 'guardian parent', 'adoptive parent', 'stepparent']);
function familyRole(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    if (FAMILY_CHILD_ROLES.has(text)) return 'child';
    if (FAMILY_PARENT_ROLES.has(text)) return 'parent';
    if (/\\b(?:daughter|son|child)\\b/.test(text)) return 'child';
    if (/\\b(?:mother|father|parent)\\b/.test(text)) return 'parent';
    return '';
}

function familySlotKey(ownerId, relation, twinGroup = '') {
    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);
}

function addFamilyFacts(state, facts, resolveReference, sourceMessageId) {
    const slots = normalizeFamilySlots(state.familySlots, new Set(state.npcs.map(npc => npc.id)));
    const byKey = new Map(slots.map((slot, index) => [familySlotKey(slot.ownerId, slot.relation, slot.twinGroup), index]));
    for (const raw of Array.isArray(facts) ? facts : []) {
        const owner = resolveReference(raw?.owner);
        const relation = String(raw?.relation || '').trim().slice(0, 120);
        const evidence = String(raw?.evidence || '').trim().slice(0, 600);
        const role = familyRole(relation);
        if (!owner || !role || !relation || !evidence) continue;
        const count = Math.max(1, Math.min(20, Math.round(Number(raw?.count) || 1)));
        const descriptor = String(raw?.descriptor || '').trim().slice(0, 240);
        const twinGroup = String(raw?.twinGroup || '').trim().slice(0, 160);
        const key = familySlotKey(owner.id, relation, twinGroup);
        const index = byKey.get(key);
        if (Number.isInteger(index)) {
            const slot = slots[index];
            slot.count = Math.max(slot.count, count);
            if (descriptor) slot.descriptor = descriptor;
            if (twinGroup) slot.twinGroup = twinGroup;
            slot.evidence = evidence;
            slot.sourceMessageId = sourceMessageId;
            slot.updatedAt = Date.now();
            continue;
        }
        slots.push({
            id: 'family:' + owner.id + ':' + normalizeName(relation).replace(/\\s+/g, '_') + ':' + normalizeName(twinGroup || descriptor).replace(/\\s+/g, '_'),
            ownerId: owner.id,
            relation,
            count,
            resolvedNpcIds: [],
            descriptor,
            twinGroup,
            evidence,
            provenance: 'explicit',
            confidence: 1,
            sourceMessageId,
            updatedAt: Date.now(),
        });
        byKey.set(key, slots.length - 1);
    }
    state.familySlots = normalizeFamilySlots(slots, new Set(state.npcs.map(npc => npc.id)));
}

function keyRelationshipToNpc(state, entry) {
    const parts = keyRelationshipParts(entry);
    if (!parts.other) return null;
    return findNpcByReference(state, parts.other);
}

export function reconcileFamilyGraphState(stateInput, { sourceMessageId = null, dossierLimits = null } = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    const validIds = new Set(state.npcs.map(npc => npc.id));
    const slots = normalizeFamilySlots(state.familySlots, validIds);

    for (const npc of state.npcs) {
        for (const entry of npc.keyRelationships || []) {
            const parts = keyRelationshipParts(entry);
            const other = keyRelationshipToNpc(state, entry);
            if (!other || other.id === npc.id) continue;
            const role = familyRole(parts.relation);
            if (role === 'child') {
                for (const slot of slots) {
                    if (slot.ownerId !== npc.id || familyRole(slot.relation) !== 'child' || slot.resolvedNpcIds.includes(other.id) || slot.resolvedNpcIds.length >= slot.count) continue;
                    slot.resolvedNpcIds.push(other.id);
                    slot.updatedAt = Date.now();
                    break;
                }
            } else if (role === 'parent') {
                for (const slot of slots) {
                    if (slot.ownerId !== other.id || familyRole(slot.relation) !== 'child' || slot.resolvedNpcIds.includes(npc.id) || slot.resolvedNpcIds.length >= slot.count) continue;
                    slot.resolvedNpcIds.push(npc.id);
                    slot.updatedAt = Date.now();
                    break;
                }
            }
        }
    }

    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;
    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));
    for (const slot of slots) {
        const resolved = [...new Set(slot.resolvedNpcIds)].filter(id => byId.has(id)).slice(0, slot.count);
        slot.resolvedNpcIds = resolved;
        if (familyRole(slot.relation) !== 'child' || resolved.length < 2) continue;
        const isTwin = Boolean(slot.twinGroup || /\\btwins?\\b/i.test(slot.descriptor));
        const relation = isTwin ? 'twin sibling' : 'sibling';
        for (let i = 0; i < resolved.length; i += 1) for (let j = i + 1; j < resolved.length; j += 1) {
            const left = byId.get(resolved[i]);
            const right = byId.get(resolved[j]);
            if (!left || !right) continue;
            const edge = { fromId: left.id, toId: right.id, relation, summary: 'Inferred from shared confirmed parent/family slot.', updatedAt: Date.now(), sourceMessageId, provenance: 'inferred', confidence: isTwin ? 0.9 : 0.75, inferred: true };
            if (![...edgeMap.values()].some(existing => {
                const ids = new Set([existing.fromId, existing.toId]);
                return ids.has(left.id) && ids.has(right.id) && /sibling/i.test(existing.relation);
            })) edgeMap.set(socialEdgeKey(edge), edge);
            for (const [owner, other] of [[left, right], [right, left]]) {
                const hasCounterpart = (owner.keyRelationships || []).some(entry => keyRelationshipOtherKey(entry) === normalizeName(other.name));
                if (!hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);
            }
        }
    }
    state.familySlots = normalizeFamilySlots(slots, validIds);
    state.socialGraph = [...edgeMap.values()].slice(-200);
    state.npcs = state.npcs.map(npc => normalizeNpc(npc));
    return normalizeState(state, state.chatKey);
}

function applyStablePatch(npc, patch, options = {}) {`,
    'key merge and family graph helpers',
);
scanner = replaceRequired(
    scanner,
    `    if (!locked.has('keyRelationships') && Array.isArray(patch?.keyRelationships)) {
        const incoming = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
        next.keyRelationships = appendUnique([], incoming, limits.keyRelationships);
    }`,
    `    if (!locked.has('keyRelationships') && (Array.isArray(patch?.keyRelationships) || Array.isArray(patch?.keyRelationshipChanges))) {
        const incoming = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
        next.keyRelationships = mergeKeyRelationshipPatch(next.keyRelationships, incoming, patch?.keyRelationshipChanges, limits.keyRelationships);
    }`,
    'key relationship merge apply',
);
scanner = replaceRequired(
    scanner,
    "        const edge = { fromId: from.id, toId: to.id, relation, summary: String(raw?.summary || '').trim().slice(0, 500), updatedAt: Date.now(), sourceMessageId };",
    "        const provenance = ['explicit', 'strong-context'].includes(String(raw?.provenance)) ? String(raw.provenance) : 'explicit';\n        const edge = { fromId: from.id, toId: to.id, relation, summary: String(raw?.summary || '').trim().slice(0, 500), updatedAt: Date.now(), sourceMessageId, provenance, confidence: provenance === 'explicit' ? 1 : 0.8, inferred: false };",
    'social edge provenance apply',
);
scanner = replaceRequired(
    scanner,
    "    state.socialGraph = [...edgeMap.values()].slice(-200);\n\n    if (options.preserveObservation !== true) {",
    "    state.socialGraph = [...edgeMap.values()].slice(-200);\n    addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId);\n    const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });\n    state.npcs = familyReconciled.npcs;\n    state.socialGraph = familyReconciled.socialGraph;\n    state.familySlots = familyReconciled.familySlots;\n\n    if (options.preserveObservation !== true) {",
    'family graph reconcile apply',
);
// Targeted output contract gets safe relationship patch/removal channels.
scanner = replaceRequired(
    scanner,
    "background: '', keyRelationships: null, memories: null, relationshipSummary:",
    "background: '', keyRelationships: null, keyRelationshipChanges: null, memories: null, relationshipSummary:",
    'targeted key relationship changes contract',
);
write('v03/scanner.js', scanner);

// Foreground rules/output contract: relationship omission is now safe and countable unnamed
// family facts have their own top-level channel without creating dossiers.
let injection = read('v03/injection.js');
injection = injection.replaceAll(
    'return the COMPLETE replacement array, preserving still-valid prior ties and adding or revising the newly established tie; do not return null.',
    'return the affected counterpart entry; NPC State preserves omitted still-valid ties locally. Remove a durable tie only through keyRelationshipChanges with action remove and explicit evidence.',
);
injection = replaceRequired(
    injection,
    "        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful.',",
    "        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful. For existing NPCs this array is a counterpart MERGE PATCH, not a whole-list replacement; omission never deletes another established tie. Use keyRelationshipChanges only for explicit removals.',\n        'COUNTABLE UNNAMED FAMILY: when narration explicitly establishes facts such as an existing NPC having two daughters, three children, or twin sons while some relatives are unnamed, put that count in top-level familyFacts with owner, relation, count, optional descriptor/twinGroup, and evidence. Do NOT create fake NPC dossiers or placeholder names for unnamed relatives. Later named family relationships may resolve those slots; shared confirmed parent slots may support generic sibling/twin-sibling inference.',",
    'foreground family rules',
);
injection = replaceRequired(
    injection,
    "\"background\":\"\",\"keyRelationships\":[],\"memories\":[]",
    "\"background\":\"\",\"keyRelationships\":[],\"keyRelationshipChanges\":[{\"other\":\"existing NPC name/id\",\"action\":\"remove\",\"evidence\":\"explicit durable-tie removal evidence\"}],\"memories\":[]",
    'foreground key relationship changes output',
);
injection = replaceRequired(
    injection,
    "\"socialEdges\":[]}",
    "\"socialEdges\":[],\"familyFacts\":[{\"owner\":\"existing NPC name/id\",\"relation\":\"daughter|son|child|other countable family role\",\"count\":2,\"descriptor\":\"optional e.g. twin daughters\",\"twinGroup\":\"optional twin label\",\"evidence\":\"explicit countable family fact\"}]}",
    'foreground family facts output',
);
write('v03/injection.js', injection);

// Manual key-relationship edits should resolve existing family slots too; deletion cleans slots.
let engine = read('v03/engine.js');
engine = replaceRequired(
    engine,
    "    parseScanJson,\n} from './scanner.js';",
    "    parseScanJson,\n    reconcileFamilyGraphState,\n} from './scanner.js';",
    'family reconcile engine import',
);
engine = replaceRequired(
    engine,
    "            state.npcs[index] = normalizeNpc(next);\n            return { npcId: current.id };",
    "            state.npcs[index] = normalizeNpc(next);\n            if (Object.prototype.hasOwnProperty.call(patch || {}, 'keyRelationships')) {\n                const reconciled = reconcileFamilyGraphState(state, { sourceMessageId: latestAssistantMessageId(getContext().chat || []), dossierLimits: getSettings().dossierLimits });\n                state.npcs = reconciled.npcs;\n                state.socialGraph = reconciled.socialGraph;\n                state.familySlots = reconciled.familySlots;\n            }\n            return { npcId: current.id };",
    'manual family reconciliation',
);
engine = replaceRequired(
    engine,
    "            state.socialGraph = (state.socialGraph || []).filter(edge => edge.fromId !== npc.id && edge.toId !== npc.id);\n            return { npcId: npc.id, name: npc.name };",
    "            state.socialGraph = (state.socialGraph || []).filter(edge => edge.fromId !== npc.id && edge.toId !== npc.id);\n            state.familySlots = (state.familySlots || []).filter(slot => slot.ownerId !== npc.id).map(slot => ({ ...slot, resolvedNpcIds: (slot.resolvedNpcIds || []).filter(id => id !== npc.id) }));\n            return { npcId: npc.id, name: npc.name };",
    'delete family slot cleanup',
);
write('v03/engine.js', engine);

// Portable bundles carry family slots as an optional v0.4 extension while old v3-compatible
// bundles remain valid because familySlots is not added to REQUIRED_DATA_ARRAYS.
let bundle = read('v03/bundle.js');
bundle = replaceRequired(
    bundle,
    "    normalizeName,\n    normalizeNpc,",
    "    normalizeFamilySlots,\n    normalizeName,\n    normalizeNpc,",
    'bundle family normalizer import',
);
bundle = replaceRequired(
    bundle,
    "        deletedNpcIds: raw.deletedNpcIds,\n    }, 'bundle');",
    "        deletedNpcIds: raw.deletedNpcIds,\n        familySlots: Array.isArray(raw.familySlots) ? raw.familySlots : [],\n    }, 'bundle');",
    'bundle normalize family input',
);
bundle = replaceRequired(
    bundle,
    "        socialGraph: normalized.socialGraph,\n        suppressedNames:",
    "        socialGraph: normalized.socialGraph,\n        familySlots: normalized.familySlots,\n        suppressedNames:",
    'bundle normalize family output',
);
bundle = replaceRequired(
    bundle,
    "            socialGraph: exportedSocialGraph(state, ids, type === 'npc'),\n            suppressedNames:",
    "            socialGraph: exportedSocialGraph(state, ids, type === 'npc'),\n            familySlots: normalizeFamilySlots((state.familySlots || []).filter(slot => type === 'full-chat' || ids.includes(slot.ownerId)), new Set(ids)),\n            suppressedNames:",
    'bundle export family slots',
);
bundle = replaceRequired(
    bundle,
    "            socialGraph,\n            suppressedNames: bundle.data.suppressedNames,",
    "            socialGraph,\n            familySlots: bundle.data.familySlots,\n            suppressedNames: bundle.data.suppressedNames,",
    'bundle replace family slots',
);
bundle = replaceRequired(
    bundle,
    "    const socialGraph = mergedEdges(state.socialGraph || [], bundle.data.socialGraph, validIds, tombstones, sameChat, skippedNpcIds);\n    const suppressedNames",
    "    const socialGraph = mergedEdges(state.socialGraph || [], bundle.data.socialGraph, validIds, tombstones, sameChat, skippedNpcIds);\n    const familyMap = new Map(normalizeFamilySlots(state.familySlots || [], validIds).map(slot => [slot.id, slot]));\n    for (const slot of normalizeFamilySlots(bundle.data.familySlots || [], validIds)) familyMap.set(slot.id, slot);\n    const familySlots = [...familyMap.values()].slice(-100);\n    const suppressedNames",
    'bundle merged family slots',
);
bundle = replaceRequired(
    bundle,
    "        socialGraph,\n        suppressedNames,\n        deletedNpcIds:",
    "        socialGraph,\n        familySlots,\n        suppressedNames,\n        deletedNpcIds:",
    'bundle merge family state',
);
write('v03/bundle.js', bundle);

let changelog = read('CHANGELOG.md');
const line = '- Phase 4 makes Key Relationships omission-safe by merging per named counterpart and requiring an explicit evidence-backed removal channel. It also adds a bounded private family-slot graph for countable unnamed relatives, partial later resolution, graph provenance/confidence, and conservative shared-parent sibling/twin-sibling inference without creating placeholder NPC dossiers. Family slots persist through sidecars/checkpoints and optional portable-bundle data.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.2\n\n', '## v0.4.2\n\n' + line + '\n', 'phase-4 changelog');
write('CHANGELOG.md', changelog);
console.log('Applied NPC State 0.4.2 phase 4 family graph and key-relationship merge protection');
