import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.25 family marker: ' + label);
    return source.replace(from, to);
}

// Persist explicitly named members inside otherwise countable family slots. This remains
// continuity metadata only and never admits a new NPC dossier by itself.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    `        const resolvedNpcIds = list(raw.resolvedNpcIds, count, 160).filter(item => item !== ownerId && (!valid || valid.has(item))).slice(0, count);\n        out.push({\n            id,\n            ownerId,\n            relation,\n            count,\n            resolvedNpcIds,\n            descriptor,`,
    `        const resolvedNpcIds = list(raw.resolvedNpcIds, count, 160).filter(item => item !== ownerId && (!valid || valid.has(item))).slice(0, count);\n        const memberNames = [];\n        const memberKeys = new Set();\n        for (const member of list(raw.memberNames ?? raw.members, Math.max(20, count), 160)) {\n            const key = normalizeName(member);\n            if (!key || memberKeys.has(key)) continue;\n            memberKeys.add(key);\n            memberNames.push(member);\n            if (memberNames.length >= count) break;\n        }\n        out.push({\n            id,\n            ownerId,\n            relation,\n            count,\n            resolvedNpcIds,\n            memberNames,\n            descriptor,`,
    'family slot member names',
);
write('v03/schema.js', schema);

let scanner = read('v03/scanner.js');
scanner = scanner.replaceAll(
    `familyFacts: [{ owner: 'existing NPC id/name', relation: 'daughter|son|child|other countable family role', count: 2, descriptor: 'optional e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit countable family fact' }]`,
    `familyFacts: [{ owner: 'existing NPC id/name', relation: 'daughter|son|child|other countable family role', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit countable family fact' }]`,
);
if (!scanner.includes("members: ['explicitly named members from visible evidence; [] when unnamed']")) {
    throw new Error('Missing v0.4.25 family member scan contract');
}

scanner = replaceRequired(
    scanner,
    `function familySlotKey(ownerId, relation, twinGroup = '') {\n    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);\n}\n\nfunction addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '') {`,
    `function familySlotKey(ownerId, relation, twinGroup = '') {\n    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);\n}\n\nfunction groundedFamilyMemberNames(raw, count, evidenceContext = '', owner = null, playerName = '') {\n    const source = Array.isArray(raw?.members) ? raw.members : (Array.isArray(raw?.memberNames) ? raw.memberNames : []);\n    const out = [];\n    const seen = new Set();\n    for (const value of source) {\n        const member = String(value || '').trim().slice(0, 160);\n        const key = normalizeName(member);\n        if (!member || !key || seen.has(key) || isTechnicalNpcIdentity(member) || GENERIC_REFERENCES.has(key)) continue;\n        if (owner && [owner.name, ...(owner.aliases || [])].some(label => normalizeName(label) === key)) continue;\n        if (keyRelationshipReferencesPlayer(member, playerName)) continue;\n        // Runtime profileContext contains public exchange evidence with structured/private\n        // blocks removed. A name found only in World_State or private chatter therefore\n        // cannot be smuggled into durable family continuity. Test/import callers with no\n        // evidence context retain backward-compatible trusted-object behavior.\n        if (String(evidenceContext || '').trim() && !containsNormalizedPhrase(evidenceContext, member)) continue;\n        seen.add(key);\n        out.push(member);\n        if (out.length >= count) break;\n    }\n    return out;\n}\n\nfunction familyMemberNpc(state, reference) {\n    const direct = findNpcByReference(state, reference);\n    if (direct) return direct;\n    const key = normalizeName(reference);\n    if (!key || key.length < 3) return null;\n    const matches = (state?.npcs || []).filter(npc =>\n        [npc?.name, ...(npc?.aliases || [])].some(label => {\n            const tokens = String(label || '').normalize('NFKC').match(/[\\p{L}\\p{N}]+(?:[’'\\-][\\p{L}\\p{N}]+)*/gu) || [];\n            return tokens.length >= 2 && tokens.some(token => normalizeName(token) === key);\n        }));\n    return matches.length === 1 ? matches[0] : null;\n}\n\nfunction familyCounterpartMatches(state, entry, memberName, memberNpc = null) {\n    const other = keyRelationshipParts(entry).other;\n    if (!other) return false;\n    if (normalizeName(other) === normalizeName(memberName)) return true;\n    if (!memberNpc) return false;\n    return familyMemberNpc(state, other)?.id === memberNpc.id;\n}\n\nfunction projectFamilySlotMembers(state, slot, limit) {\n    const owner = (state?.npcs || []).find(npc => npc.id === slot?.ownerId);\n    if (!owner) return;\n    const members = Array.isArray(slot?.memberNames) ? slot.memberNames.slice(0, slot.count) : [];\n    if (!members.length) return;\n\n    // Resolution is allowed even when the user's manual profile lock prevents automatic\n    // dossier text changes. This keeps the private family graph accurate without mutating\n    // user-owned keyRelationships.\n    for (const memberName of members) {\n        const memberNpc = familyMemberNpc(state, memberName);\n        if (memberNpc && memberNpc.id !== owner.id && !slot.resolvedNpcIds.includes(memberNpc.id) && slot.resolvedNpcIds.length < slot.count) {\n            slot.resolvedNpcIds.push(memberNpc.id);\n            slot.updatedAt = Date.now();\n        }\n    }\n    if ((owner.manualProfileFields || []).includes('keyRelationships')) return;\n\n    let entries = normalizeKeyRelationshipEntries(owner.keyRelationships, Math.max(limit, 30), 500);\n    for (const memberName of members) {\n        const memberNpc = familyMemberNpc(state, memberName);\n        if (memberNpc?.id === owner.id) continue;\n        const displayName = String(memberNpc?.name || memberName).trim();\n        if (!displayName) continue;\n        const matches = [];\n        for (let index = 0; index < entries.length; index += 1) {\n            if (familyCounterpartMatches(state, entries[index], memberName, memberNpc)) matches.push(index);\n        }\n        if (matches.length) {\n            const first = matches[0];\n            const existingRelation = keyRelationshipParts(entries[first]).relation;\n            const preservedRelation = familyRole(existingRelation) === familyRole(slot.relation) ? existingRelation : slot.relation;\n            entries[first] = displayName + ' - ' + preservedRelation;\n            for (let index = matches.length - 1; index >= 1; index -= 1) entries.splice(matches[index], 1);\n        } else if (entries.length < limit) {\n            entries.push(displayName + ' - ' + slot.relation);\n        }\n    }\n    owner.keyRelationships = normalizeKeyRelationshipEntries(entries, limit, 500);\n}\n\nfunction addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '', playerName = '') {`,
    'named family helpers',
);

scanner = replaceRequired(
    scanner,
    `        const count = Math.max(1, Math.min(20, Math.round(Number(raw?.count) || 1)));\n        const descriptor = String(raw?.descriptor || '').trim().slice(0, 240);`,
    `        const count = Math.max(1, Math.min(20, Math.round(Number(raw?.count) || 1)));\n        const memberNames = groundedFamilyMemberNames(raw, count, evidenceContext, owner, playerName);\n        const descriptor = String(raw?.descriptor || '').trim().slice(0, 240);`,
    'extract grounded family members',
);
scanner = replaceRequired(
    scanner,
    `            slot.count = Math.max(slot.count, count);\n            if (descriptor) slot.descriptor = descriptor;`,
    `            slot.count = Math.max(slot.count, count);\n            if (memberNames.length) {\n                const merged = [...(slot.memberNames || []), ...memberNames];\n                const seen = new Set();\n                slot.memberNames = merged.filter(name => {\n                    const key = normalizeName(name);\n                    if (!key || seen.has(key)) return false;\n                    seen.add(key);\n                    return true;\n                }).slice(0, slot.count);\n            }\n            if (descriptor) slot.descriptor = descriptor;`,
    'merge named family members',
);
scanner = replaceRequired(
    scanner,
    `            count,\n            resolvedNpcIds: [],\n            descriptor,`,
    `            count,\n            resolvedNpcIds: [],\n            memberNames,\n            descriptor,`,
    'store named family members',
);

scanner = replaceRequired(
    scanner,
    `function keyRelationshipToNpc(state, entry) {\n    const parts = keyRelationshipParts(entry);\n    if (!parts.other) return null;\n    return findNpcByReference(state, parts.other);\n}`,
    `function keyRelationshipToNpc(state, entry) {\n    const parts = keyRelationshipParts(entry);\n    if (!parts.other) return null;\n    return familyMemberNpc(state, parts.other);\n}`,
    'family short-name resolution',
);

scanner = replaceRequired(
    scanner,
    `    const validIds = new Set(state.npcs.map(npc => npc.id));\n    const slots = normalizeFamilySlots(state.familySlots, validIds);\n\n    for (const npc of state.npcs) {`,
    `    const validIds = new Set(state.npcs.map(npc => npc.id));\n    const slots = normalizeFamilySlots(state.familySlots, validIds);\n    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;\n    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));\n\n    // Explicitly named members are durable family canon even when they are not dossiers.\n    // Project them into the owner's key relationships first, then let ordinary slot\n    // resolution and sibling inference consume any members that already have dossiers.\n    for (const slot of slots) projectFamilySlotMembers(state, slot, limit);\n\n    for (const npc of state.npcs) {`,
    'family projection before graph resolution',
);
scanner = replaceRequired(
    scanner,
    `    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));\n    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;\n    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));\n    for (const slot of slots) {`,
    `    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));\n    for (const slot of slots) {`,
    'reuse family graph maps',
);
scanner = replaceRequired(
    scanner,
    `        addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''));`,
    `        addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''), playerName);`,
    'family player exclusion plumbing',
);
write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    `'COUNTABLE UNNAMED FAMILY: when narration explicitly establishes facts such as an existing NPC having two daughters, three children, or twin sons while some relatives are unnamed, put that count in top-level familyFacts with owner, relation, count, optional descriptor/twinGroup, and evidence. Do NOT create fake NPC dossiers or placeholder names for unnamed relatives. Later named family relationships may resolve those slots; shared confirmed parent slots may support generic sibling/twin-sibling inference.',`,
    `'COUNTABLE FAMILY FACTS: when narration explicitly establishes facts such as an existing NPC having two daughters, three children, or twin sons, put that count in top-level familyFacts with owner, relation, count, members, optional descriptor/twinGroup, and evidence. members MUST list each family member whose personal name is explicitly established in the current visible exchange, up to count; use [] for unnamed members. Named members are continuity metadata and MUST NOT create NPC dossiers by themselves. NPC State will project grounded named members into the owner keyRelationships even when those relatives are not dossiers. Never source member names only from World_State, NPC_Inner_Chatter, control blocks, or older continuity. Shared confirmed parent slots may support generic sibling/twin-sibling inference.',`,
    'foreground named family contract',
);
write('v03/injection.js', injection);

console.log('Applied NPC State 0.4.25 named family key-relationship projection');
