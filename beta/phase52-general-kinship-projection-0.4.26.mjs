import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.26 kinship marker: ' + label);
    return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
    if (source.includes(replacement.trim())) return source;
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start) : -1;
    if (start < 0 || end < 0) throw new Error('Missing v0.4.26 kinship range: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

let scanner = read('v03/scanner.js');

scanner = replaceRequired(
    scanner,
    `familyFacts: [{ owner: 'existing NPC id/name', relation: 'daughter|son|child|other countable family role', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit countable family fact' }]`,
    `familyFacts: [{ owner: 'existing NPC id/name', relation: 'family/kinship role, e.g. daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law', count: 2, members: ['explicitly named members from visible evidence; [] when unnamed'], descriptor: 'optional family detail e.g. twin daughters', twinGroup: 'optional shared twin label', evidence: 'explicit family/kinship fact' }]`,
    'recovery familyFacts contract',
);

if (!scanner.includes('const FAMILY_KINSHIP_GROUPS')) {
    scanner = replaceBetween(
        scanner,
        `const FAMILY_CHILD_ROLES`,
        `function familySlotKey`,
        `const FAMILY_KINSHIP_GROUPS = Object.freeze({
    child: new Set(['child', 'daughter', 'son', 'adopted child', 'adopted daughter', 'adopted son', 'stepchild', 'step daughter', 'step son', 'foster child', 'foster daughter', 'foster son']),
    parent: new Set(['parent', 'mother', 'father', 'guardian parent', 'adoptive parent', 'adoptive mother', 'adoptive father', 'stepparent', 'step mother', 'step father', 'foster parent', 'foster mother', 'foster father']),
    sibling: new Set(['sibling', 'sister', 'brother', 'twin sibling', 'twin sister', 'twin brother', 'half sibling', 'half sister', 'half brother', 'step sibling', 'step sister', 'step brother']),
    aunt_uncle: new Set(['aunt', 'uncle', 'great aunt', 'great uncle', 'grandaunt', 'granduncle']),
    niece_nephew: new Set(['niece', 'nephew', 'great niece', 'great nephew', 'grandniece', 'grandnephew']),
    grandparent: new Set(['grandparent', 'grandmother', 'grandfather', 'great grandparent', 'great grandmother', 'great grandfather']),
    grandchild: new Set(['grandchild', 'granddaughter', 'grandson', 'great grandchild', 'great granddaughter', 'great grandson']),
    cousin: new Set(['cousin', 'first cousin', 'second cousin']),
    spouse: new Set(['spouse', 'wife', 'husband']),
    guardian: new Set(['guardian', 'legal guardian']),
    ward: new Set(['ward']),
    parent_in_law: new Set(['parent in law', 'mother in law', 'father in law']),
    child_in_law: new Set(['child in law', 'daughter in law', 'son in law']),
    sibling_in_law: new Set(['sibling in law', 'sister in law', 'brother in law']),
});
function familyRole(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    for (const [group, values] of Object.entries(FAMILY_KINSHIP_GROUPS)) if (values.has(text)) return group;
    // Permit ordinary modifiers such as younger sister or paternal uncle without requiring
    // an exhaustive vocabulary. Order matters so compound/in-law and grand relations do
    // not collapse into their simpler parent/child/sibling words.
    if (/\\b(?:mother|father|parent)\\s+in\\s+law\\b/.test(text)) return 'parent_in_law';
    if (/\\b(?:daughter|son|child)\\s+in\\s+law\\b/.test(text)) return 'child_in_law';
    if (/\\b(?:sister|brother|sibling)\\s+in\\s+law\\b/.test(text)) return 'sibling_in_law';
    if (/\\b(?:great\\s+)?grand(?:mother|father|parent)\\b/.test(text)) return 'grandparent';
    if (/\\b(?:great\\s+)?grand(?:daughter|son|child)\\b/.test(text)) return 'grandchild';
    if (/\\b(?:aunt|uncle)\\b/.test(text)) return 'aunt_uncle';
    if (/\\b(?:niece|nephew)\\b/.test(text)) return 'niece_nephew';
    if (/\\bcousin\\b/.test(text)) return 'cousin';
    if (/\\b(?:spouse|wife|husband)\\b/.test(text)) return 'spouse';
    if (/\\bguardian\\b/.test(text)) return 'guardian';
    if (/\\bward\\b/.test(text)) return 'ward';
    if (/\\b(?:sister|brother|sibling)\\b/.test(text)) return 'sibling';
    if (/\\b(?:daughter|son|child)\\b/.test(text)) return 'child';
    if (/\\b(?:mother|father|parent)\\b/.test(text)) return 'parent';
    return '';
}

function reciprocalFamilyRelation(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    switch (familyRole(text)) {
        case 'child': return 'parent';
        case 'parent': return 'child';
        case 'sibling':
            if (/\\btwin\\b/.test(text)) return 'twin sibling';
            if (/\\bhalf\\b/.test(text)) return 'half sibling';
            if (/\\bstep\\b/.test(text)) return 'step sibling';
            return 'sibling';
        case 'aunt_uncle': return /\\b(?:great|grand)\\b/.test(text) ? 'great-niece/nephew' : 'niece/nephew';
        case 'niece_nephew': return /\\b(?:great|grand)\\b/.test(text) ? 'great-aunt/uncle' : 'aunt/uncle';
        case 'grandparent': return /\\bgreat\\b/.test(text) ? 'great-grandchild' : 'grandchild';
        case 'grandchild': return /\\bgreat\\b/.test(text) ? 'great-grandparent' : 'grandparent';
        case 'cousin': return 'cousin';
        case 'spouse': return 'spouse';
        case 'guardian': return 'ward';
        case 'ward': return 'guardian';
        case 'parent_in_law': return 'child-in-law';
        case 'child_in_law': return 'parent-in-law';
        case 'sibling_in_law': return 'sibling-in-law';
        default: return '';
    }
}

function resolveFamilySlotMember(slots, ownerId, relation, memberId) {
    const group = familyRole(relation);
    if (!group || !ownerId || !memberId || ownerId === memberId) return false;
    const relationKey = normalizeName(relation);
    const candidates = slots
        .filter(slot => slot.ownerId === ownerId
            && familyRole(slot.relation) === group
            && !slot.resolvedNpcIds.includes(memberId)
            && slot.resolvedNpcIds.length < slot.count)
        .sort((left, right) => Number(normalizeName(right.relation) === relationKey) - Number(normalizeName(left.relation) === relationKey));
    const slot = candidates[0];
    if (!slot) return false;
    slot.resolvedNpcIds.push(memberId);
    slot.updatedAt = Date.now();
    return true;
}

`,
        'family relation classification',
    );
}

if (!scanner.includes('function upsertFamilyRelationship')) {
    scanner = replaceBetween(
        scanner,
        `function projectFamilySlotMembers`,
        `function addFamilyFacts`,
        `function upsertFamilyRelationship(state, npc, counterpartName, counterpartNpc, relation, limit) {
    if (!npc || !relation || (npc.manualProfileFields || []).includes('keyRelationships')) return;
    const displayName = String(counterpartNpc?.name || counterpartName || '').trim();
    if (!displayName) return;
    let entries = normalizeKeyRelationshipEntries(npc.keyRelationships, Math.max(limit, 30), 500);
    const matches = [];
    for (let index = 0; index < entries.length; index += 1) {
        if (familyCounterpartMatches(state, entries[index], counterpartName || displayName, counterpartNpc)) matches.push(index);
    }
    if (matches.length) {
        const first = matches[0];
        const existingRelation = keyRelationshipParts(entries[first]).relation;
        const preservedRelation = familyRole(existingRelation) === familyRole(relation) ? existingRelation : relation;
        entries[first] = displayName + ' - ' + preservedRelation;
        for (let index = matches.length - 1; index >= 1; index -= 1) entries.splice(matches[index], 1);
    } else if (entries.length < limit) {
        entries.push(displayName + ' - ' + relation);
    }
    npc.keyRelationships = normalizeKeyRelationshipEntries(entries, limit, 500);
}

function projectFamilySlotMembers(state, slot, limit) {
    const owner = (state?.npcs || []).find(npc => npc.id === slot?.ownerId);
    if (!owner) return;
    const members = Array.isArray(slot?.memberNames) ? slot.memberNames.slice(0, slot.count) : [];
    if (!members.length) return;

    for (const memberName of members) {
        const memberNpc = familyMemberNpc(state, memberName);
        if (memberNpc && memberNpc.id !== owner.id && !slot.resolvedNpcIds.includes(memberNpc.id) && slot.resolvedNpcIds.length < slot.count) {
            slot.resolvedNpcIds.push(memberNpc.id);
            slot.updatedAt = Date.now();
        }
        if (memberNpc?.id === owner.id) continue;
        upsertFamilyRelationship(state, owner, memberName, memberNpc, slot.relation, limit);
        const reciprocal = memberNpc ? reciprocalFamilyRelation(slot.relation) : '';
        if (memberNpc && reciprocal) upsertFamilyRelationship(state, memberNpc, owner.name, owner, reciprocal, limit);
    }
}

`,
        'family reciprocal projection',
    );
}

if (!scanner.includes('resolveFamilySlotMember(slots, npc.id, parts.relation, other.id)')) {
    scanner = replaceBetween(
        scanner,
        `    for (const npc of state.npcs) {\n        for (const entry of npc.keyRelationships || []) {`,
        `\n\n    const edgeMap = new Map`,
        `    for (const npc of state.npcs) {
        for (const entry of npc.keyRelationships || []) {
            const parts = keyRelationshipParts(entry);
            const other = keyRelationshipToNpc(state, entry);
            if (!other || other.id === npc.id || !familyRole(parts.relation)) continue;
            if (resolveFamilySlotMember(slots, npc.id, parts.relation, other.id)) continue;
            const reciprocal = reciprocalFamilyRelation(parts.relation);
            if (reciprocal) resolveFamilySlotMember(slots, other.id, reciprocal, npc.id);
        }
    }`,
        'generic family slot resolution',
    );
}

write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    `'COUNTABLE FAMILY FACTS: when narration explicitly establishes facts such as an existing NPC having two daughters, three children, or twin sons, put that count in top-level familyFacts with owner, relation, count, members, optional descriptor/twinGroup, and evidence. members MUST list each family member whose personal name is explicitly established in the current visible exchange, up to count; use [] for unnamed members. Named members are continuity metadata and MUST NOT create NPC dossiers by themselves. NPC State will project grounded named members into the owner keyRelationships even when those relatives are not dossiers. Never source member names only from World_State, NPC_Inner_Chatter, control blocks, or older continuity. Shared confirmed parent slots may support generic sibling/twin-sibling inference.',`,
    `'COUNTABLE FAMILY FACTS / GENERAL KINSHIP: when narration explicitly establishes a significant non-player family or kinship tie, put it in top-level familyFacts with owner, directional relation from the OWNER perspective, count, members, optional descriptor/twinGroup, and evidence. This includes child/parent, sibling, aunt/uncle, niece/nephew, cousin, grandparent/grandchild, spouse, guardian/ward, and common in-law ties. members MUST list each family member whose personal name is explicitly established in the current visible exchange, up to count; use [] for unnamed members. Named members are continuity metadata and MUST NOT create NPC dossiers by themselves. NPC State projects grounded named members into the owner keyRelationships and may add a conservative reciprocal tie when the relative already has a dossier; never guess an unknown gender merely to choose the reciprocal label. Never source member names only from World_State, NPC_Inner_Chatter, control blocks, or older continuity. Shared confirmed parent slots may still support generic sibling/twin-sibling inference.',`,
    'foreground general kinship rule',
);
injection = replaceRequired(
    injection,
    `\"familyFacts\":[{\"owner\":\"existing NPC name/id\",\"relation\":\"daughter|son|child|other countable family role\",\"count\":2,\"descriptor\":\"optional e.g. twin daughters\",\"twinGroup\":\"optional twin label\",\"evidence\":\"explicit countable family fact\"}]`,
    `\"familyFacts\":[{\"owner\":\"existing NPC name/id\",\"relation\":\"family/kinship role such as daughter|parent|sister|brother|aunt|uncle|niece|nephew|cousin|grandparent|grandchild|spouse|guardian|ward|in-law\",\"count\":2,\"members\":[\"explicitly named members from current visible evidence\"],\"descriptor\":\"optional family detail e.g. twin daughters\",\"twinGroup\":\"optional twin label\",\"evidence\":\"explicit family/kinship fact\"}]`,
    'foreground output familyFacts shape',
);
write('v03/injection.js', injection);

console.log('Applied NPC State 0.4.26 general kinship projection');
