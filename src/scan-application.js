import { evidenceReferenceScope } from './evidence-adapter.js';
import { DOSSIER_SEMANTIC_FIELDS, dossierFieldGroup, dossierFieldValueIssue, normalizeDossierTextCollection } from './model/dossier-fields.js';
import { relationshipEvidenceExcerptMatch } from './relationship-evidence.js';
import { GENERIC_REFERENCES, appendUnique, containsNormalizedPhrase, evidenceTextKey, identityTokenMention, resolvePlayerName, shortActivityIdentityCandidates, shortActivityIdentityUnique, uniqueStrings } from './scan-helpers.js';
import { applyLifeState } from './scan-lifecycle.js';
import { applyRelationshipChange, applyRelationshipSummaryProjection, relationshipDeltaForPatch, relationshipEvaluationDiagnostic } from './scan-relationships.js';
import { DEFAULT_RELATIONSHIP_CAPS, RELATIONSHIP_AXES, applyBirthdayFill, findNpcByReference, makeNpcId, normalizeActualAge, normalizeApparentAge, normalizeAppearanceForms, normalizeBirthday, normalizeCurrentStatus, normalizeDossierLimits, normalizeFamilySlots, normalizeKeyRelationshipEntries, normalizeMemoryEntries, normalizeName, normalizeNpc, normalizeNpcAdmissionMode, normalizeState } from './schema.js';

export function keyRelationshipReferencesPlayer(value, playerName = '') {
    const key = normalizeName(value);
    if (!key) return false;
    if (['player', 'user', 'pc'].includes(key)) return true;
    for (const marker of ['the player', 'player character', 'the player character', 'the user', 'current player', 'current user', 'player persona', 'user persona']) {
        if (containsNormalizedPhrase(key, marker)) return true;
    }
    const playerKey = normalizeName(playerName);
    return Boolean(playerKey && containsNormalizedPhrase(key, playerKey));
}

function sanitizePlayerKeyRelationships(npc, playerName = '') {
    if ((npc?.manualProfileFields || []).includes('keyRelationships')) return npc;
    const current = Array.isArray(npc?.keyRelationships) ? npc.keyRelationships : [];
    const filtered = current.filter(item => !keyRelationshipReferencesPlayer(item, playerName));
    if (filtered.length === current.length) return npc;
    const next = structuredClone(npc);
    next.keyRelationships = filtered;
    next.updatedAt = Math.max(Date.now(), Number(next.updatedAt || 0) + 1);
    return next;
}

export function sanitizeStructuredDossierPatch(patch = {}, npc = {}) {
    const out = {
        id: String(npc?.id || patch?.id || '').trim(),
        name: String(npc?.name || patch?.name || '').trim(),
        relationshipChange: { evaluated: true, impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, priority: [], axisEvidence: {}, evidence: '', reason: '' },
    };
    for (const field of [
        'aliases', 'role', 'species', 'age', 'ageChange', 'ageProgression', 'apparentAge', 'birthday', 'appearance', 'appearanceForms', 'appearanceFormChanges',
        'personality', 'behaviorProfile', 'speech', 'mannerisms', 'profileChanges', 'canonChanges', 'background',
        'keyRelationships', 'keyRelationshipChanges', 'memories',
    ]) {
        if (Object.prototype.hasOwnProperty.call(patch || {}, field)) out[field] = structuredClone(patch[field]);
    }
    return out;
}

// a second pass supplements the already-committed exchange without replaying it.

function isTechnicalNpcIdentity(value) {
    return /^npc(?:[-_:]|$)/i.test(String(value ?? '').trim());
}

function humanIdentityCandidate(value, role = '') {
    const clean = String(value ?? '').trim();
    if (!clean || isTechnicalNpcIdentity(clean) || GENERIC_REFERENCES.has(normalizeName(clean))) return '';
    if (role && normalizeName(clean) === normalizeName(role)) return '';
    return clean;
}

function machineIdentityContainsCandidate(machineValue, candidate) {
    const machine = normalizeName(String(machineValue ?? '').replace(/^npc[-_:]*/i, ''));
    const human = normalizeName(candidate);
    return Boolean(machine && human && (machine === human || ` ${machine} `.includes(` ${human} `)));
}

function canonicalPatchName(patch = {}, referenceCandidates = []) {
    const direct = humanIdentityCandidate(patch?.name, patch?.role);
    if (direct) return direct;

    const machine = String(patch?.name || patch?.id || '').trim();
    const candidates = [];
    const push = (value, requireMachineMatch = false) => {
        const clean = humanIdentityCandidate(value, patch?.role);
        if (!clean) return;
        if (requireMachineMatch && machine && !machineIdentityContainsCandidate(machine, clean)) return;
        if (!candidates.some(item => normalizeName(item) === normalizeName(clean))) candidates.push(clean);
    };
    for (const alias of Array.isArray(patch?.aliases) ? patch.aliases : []) push(alias);
    for (const reference of Array.isArray(referenceCandidates) ? referenceCandidates : []) push(reference, true);
    candidates.sort((a, b) => {
        const aWords = normalizeName(a).split(/\s+/).filter(Boolean).length;
        const bWords = normalizeName(b).split(/\s+/).filter(Boolean).length;
        return bWords - aWords || b.length - a.length;
    });
    return candidates[0] || '';
}

function identityOwnerForValue(state, value) {
    const key = normalizeName(value);
    if (!key) return null;
    return (state?.npcs || []).find(candidate =>
        normalizeName(candidate?.name) === key
        || (candidate?.aliases || []).some(alias => normalizeName(alias) === key)) || null;
}

function automaticIdentityPatchConflict(state, npc, patch, referenceCandidates = []) {
    const values = [
        canonicalPatchName(patch, referenceCandidates),
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
    ].map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
    for (const value of values) {
        const owner = identityOwnerForValue(state, value);
        if (owner && (!npc || owner.id !== npc.id)) return { value, ownerId: owner.id };
    }
    return null;
}

function preflightAutomaticIdentityPatches(state, patches = [], referenceCandidates = []) {
    const owners = new Map();
    const initialIdentityKeys = new Set();
    for (const npc of state?.npcs || []) {
        for (const value of [npc?.name, ...(npc?.aliases || [])]) {
            const key = normalizeName(value);
            if (key) { owners.set(key, npc.id); initialIdentityKeys.add(key); }
        }
    }
    for (let index = 0; index < patches.length; index += 1) {
        const patch = patches[index];
        const patchId = String(patch?.id || '').trim();
        const canonicalName = canonicalPatchName(patch, referenceCandidates);
        const byId = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        const existing = byId || (canonicalName ? findNpcByReference(state, canonicalName) : null);
        const prospectiveOwner = existing?.id || ('pending:' + index);
        const values = [canonicalName, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])]
            .map(value => humanIdentityCandidate(value, patch?.role)).filter(Boolean);
        for (const value of values) {
            const key = normalizeName(value);
            const owner = owners.get(key);
            if (owner && owner !== prospectiveOwner) {
                // A collision with canon that already existed before this observation is
                // handled by the authoritative identity conflict check as a local patch rejection.
                // A newly claimed key is a same-observation conflict and invalidates the payload.
                if (!initialIdentityKeys.has(key)) {
                    throw new Error('NPC State scanner identity collision inside one observation: ' + value + '.');
                }
            }
        }
        for (const value of values) {
            const key = normalizeName(value);
            if (key && (!initialIdentityKeys.has(key) || owners.get(key) === prospectiveOwner)) owners.set(key, prospectiveOwner);
        }
    }
}

function repairTechnicalStoredName(npc) {
    if (!isTechnicalNpcIdentity(npc?.name)) return npc;
    if (npc?.manual === true || (npc?.manualProfileFields || []).includes('name')) return npc;
    const candidates = (Array.isArray(npc?.aliases) ? npc.aliases : [])
        .map(alias => humanIdentityCandidate(alias, npc?.role))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
    const name = candidates[0] || '';
    if (!name) return npc;
    const next = structuredClone(npc);
    next.name = name;
    next.aliases = (next.aliases || []).filter(alias => {
        const key = normalizeName(alias);
        return key && key !== normalizeName(name) && !isTechnicalNpcIdentity(alias);
    });
    next.updatedAt = Math.max(Date.now(), Number(next.updatedAt || 0) + 1);
    return normalizeNpc(next);
}

function patchReferenceMatches(patch, reference) {
    const key = normalizeName(reference);
    if (!key) return false;
    if (String(patch?.id || '').trim() === String(reference || '').trim()) return true;
    if (normalizeName(patch?.name) === key) return true;
    if ((Array.isArray(patch?.aliases) ? patch.aliases : []).some(alias => normalizeName(alias) === key)) return true;
    return normalizeName(canonicalPatchName(patch, [reference])) === key;
}

function createFromPatch(patch, sourceMessageId, referenceCandidates = []) {
    const name = canonicalPatchName(patch, referenceCandidates);
    // Never persist an LLM transport key as a human-facing dossier name. If no grounded
    // human identity can be recovered from the patch/aliases/activity references, fail
    // closed and let a later scan recover it rather than poisoning canonical identity.
    if (!name || isTechnicalNpcIdentity(name) || GENERIC_REFERENCES.has(normalizeName(name))) return null;
    return normalizeNpc({
        id: makeNpcId(name, `${sourceMessageId}-${Math.random()}`),
        name,
        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
        createdAt: Date.now(),
    });
}

function profileEvidenceGrounded(evidence, context) {
    // Identity normalization is intentionally short (160 chars); evidence grounding is not.
    // Using normalizeName() here silently hid evidence appearing later in a normal scene.
    const proof = evidenceTextKey(evidence, 1200);
    const source = evidenceTextKey(context, 20000);
    if (!proof || !source) return false;
    if (source.includes(proof)) return true;
    const stop = new Set(['the','and','that','this','with','from','into','their','they','them','then','when','while','because','after','before','more','less','very','some','current','exchange','npc','player']);
    const proofTokens = proof.split(/\s+/).filter(token => token.length >= 3 && !stop.has(token));
    const sourceTokens = new Set(source.split(/\s+/).filter(token => token.length >= 3));
    if (!proofTokens.length) return false;
    const matched = proofTokens.filter(token => sourceTokens.has(token)).length;
    return matched >= Math.min(2, proofTokens.length) && matched / proofTokens.length >= 0.34;
}

function keyRelationshipParts(entry) {
    const clean = String(entry || '').trim();
    const match = clean.match(/^(.+?)\s+(?:-|–|—)\s+(.+)$/);
    if (!match) return { other: '', relation: clean };
    return { other: match[1].trim(), relation: match[2].trim() };
}

function keyRelationshipOtherKey(entry) {
    return normalizeName(keyRelationshipParts(entry).other);
}

const FAMILY_KINSHIP_GROUPS = Object.freeze({
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
    if (/\b(?:mother|father|parent)\s+in\s+law\b/.test(text)) return 'parent_in_law';
    if (/\b(?:daughter|son|child)\s+in\s+law\b/.test(text)) return 'child_in_law';
    if (/\b(?:sister|brother|sibling)\s+in\s+law\b/.test(text)) return 'sibling_in_law';
    if (/\b(?:great\s+)?grand(?:mother|father|parent)\b/.test(text)) return 'grandparent';
    if (/\b(?:great\s+)?grand(?:daughter|son|child)\b/.test(text)) return 'grandchild';
    if (/\b(?:aunt|uncle)\b/.test(text)) return 'aunt_uncle';
    if (/\b(?:niece|nephew)\b/.test(text)) return 'niece_nephew';
    if (/\bcousin\b/.test(text)) return 'cousin';
    if (/\b(?:spouse|wife|husband)\b/.test(text)) return 'spouse';
    if (/\bguardian\b/.test(text)) return 'guardian';
    if (/\bward\b/.test(text)) return 'ward';
    if (/\b(?:sister|brother|sibling)\b/.test(text)) return 'sibling';
    if (/\b(?:daughter|son|child)\b/.test(text)) return 'child';
    if (/\b(?:mother|father|parent)\b/.test(text)) return 'parent';
    return '';
}

function reciprocalFamilyRelation(value) {
    const text = normalizeName(String(value || '').split(':')[0]);
    switch (familyRole(text)) {
        case 'child': return 'parent';
        case 'parent': return 'child';
        case 'sibling':
            if (/\btwin\b/.test(text)) return 'twin sibling';
            if (/\bhalf\b/.test(text)) return 'half sibling';
            if (/\bstep\b/.test(text)) return 'step sibling';
            return 'sibling';
        case 'aunt_uncle': return /\b(?:great|grand)\b/.test(text) ? 'great-niece/nephew' : 'niece/nephew';
        case 'niece_nephew': return /\b(?:great|grand)\b/.test(text) ? 'great-aunt/uncle' : 'aunt/uncle';
        case 'grandparent': return /\bgreat\b/.test(text) ? 'great-grandchild' : 'grandchild';
        case 'grandchild': return /\bgreat\b/.test(text) ? 'great-grandparent' : 'grandparent';
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

function familySlotKey(ownerId, relation, twinGroup = '') {
    return String(ownerId || '') + '|' + familyRole(relation) + '|' + normalizeName(relation) + '|' + normalizeName(twinGroup);
}

function groundedFamilyMemberNames(raw, count, evidenceContext = '', owner = null, playerName = '') {
    const source = Array.isArray(raw?.members) ? raw.members : (Array.isArray(raw?.memberNames) ? raw.memberNames : []);
    const out = [];
    const seen = new Set();
    for (const value of source) {
        const member = typeof value === 'string' ? value.trim().slice(0, 160) : '';
        const key = normalizeName(member);
        if (!member || !key || seen.has(key) || isTechnicalNpcIdentity(member) || GENERIC_REFERENCES.has(key)) continue;
        if (owner && [owner.name, ...(owner.aliases || [])].some(label => normalizeName(label) === key)) continue;
        if (keyRelationshipReferencesPlayer(member, playerName)) continue;
        // Runtime profileContext contains public exchange evidence with structured/private
        // blocks removed. A name found only in World_State or private chatter therefore
        // cannot be smuggled into durable family continuity. Test/import callers with no
        // evidence context retain backward-compatible trusted-object behavior.
        if (String(evidenceContext || '').trim() && !containsNormalizedPhrase(evidenceContext, member)) continue;
        seen.add(key);
        out.push(member);
        if (out.length >= count) break;
    }
    return out;
}

function familyMemberNpc(state, reference) {
    const direct = findNpcByReference(state, reference);
    if (direct) return direct;
    const key = normalizeName(reference);
    if (!key || key.length < 3) return null;
    const matches = (state?.npcs || []).filter(npc =>
        [npc?.name, ...(npc?.aliases || [])].some(label => {
            const tokens = String(label || '').normalize('NFKC').match(/[\p{L}\p{N}]+(?:[’'\-][\p{L}\p{N}]+)*/gu) || [];
            return tokens.length >= 2 && tokens.some(token => normalizeName(token) === key);
        }));
    return matches.length === 1 ? matches[0] : null;
}

function familyCounterpartMatches(state, entry, memberName, memberNpc = null) {
    const other = keyRelationshipParts(entry).other;
    if (!other) return false;
    if (normalizeName(other) === normalizeName(memberName)) return true;
    if (!memberNpc) return false;
    return familyMemberNpc(state, other)?.id === memberNpc.id;
}

function upsertFamilyRelationship(state, npc, counterpartName, counterpartNpc, relation, limit) {
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

function addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '', playerName = '') {
    const slots = normalizeFamilySlots(state.familySlots, new Set(state.npcs.map(npc => npc.id)));
    const byKey = new Map(slots.map((slot, index) => [familySlotKey(slot.ownerId, slot.relation, slot.twinGroup), index]));
    for (const raw of Array.isArray(facts) ? facts : []) {
        const owner = resolveReference(raw?.owner);
        const relation = typeof raw?.relation === 'string' ? raw.relation.trim().slice(0, 120) : '';
        const evidence = typeof raw?.evidence === 'string' ? raw.evidence.trim().slice(0, 600) : '';
        const role = familyRole(relation);
        if (!owner || !role || !relation || !evidence) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        const count = Math.max(1, Math.min(20, Math.round(Number(raw?.count) || 1)));
        const memberNames = groundedFamilyMemberNames(raw, count, evidenceContext, owner, playerName);
        const descriptor = typeof raw?.descriptor === 'string' ? raw.descriptor.trim().slice(0, 240) : '';
        const twinGroup = typeof raw?.twinGroup === 'string' ? raw.twinGroup.trim().slice(0, 160) : '';
        const key = familySlotKey(owner.id, relation, twinGroup);
        const index = byKey.get(key);
        if (Number.isInteger(index)) {
            const slot = slots[index];
            slot.count = Math.max(slot.count, count);
            if (memberNames.length) {
                const merged = [...(slot.memberNames || []), ...memberNames];
                const seen = new Set();
                slot.memberNames = merged.filter(name => {
                    const key = normalizeName(name);
                    if (!key || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                }).slice(0, slot.count);
            }
            if (descriptor) slot.descriptor = descriptor;
            if (twinGroup) slot.twinGroup = twinGroup;
            slot.evidence = evidence;
            slot.sourceMessageId = sourceMessageId;
            slot.updatedAt = Date.now();
            continue;
        }
        slots.push({
            id: 'family:' + owner.id + ':' + normalizeName(relation).replace(/\s+/g, '_') + ':' + normalizeName(twinGroup || descriptor).replace(/\s+/g, '_'),
            ownerId: owner.id,
            relation,
            count,
            resolvedNpcIds: [],
            memberNames,
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
    return familyMemberNpc(state, parts.other);
}

export function reconcileFamilyGraphState(stateInput, { sourceMessageId = null, dossierLimits = null } = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    const validIds = new Set(state.npcs.map(npc => npc.id));
    const slots = normalizeFamilySlots(state.familySlots, validIds);
    const limit = normalizeDossierLimits(dossierLimits || {}).keyRelationships;
    const byId = new Map(state.npcs.map(npc => [npc.id, npc]));

    // Explicitly named members are durable family canon even when they are not dossiers.
    // Project them into the owner's key relationships first, then let ordinary slot
    // resolution and sibling inference consume any members that already have dossiers.
    for (const slot of slots) projectFamilySlotMembers(state, slot, limit);

    for (const npc of state.npcs) {
        for (const entry of npc.keyRelationships || []) {
            const parts = keyRelationshipParts(entry);
            const other = keyRelationshipToNpc(state, entry);
            if (!other || other.id === npc.id || !familyRole(parts.relation)) continue;
            if (resolveFamilySlotMember(slots, npc.id, parts.relation, other.id)) continue;
            const reciprocal = reciprocalFamilyRelation(parts.relation);
            if (reciprocal) resolveFamilySlotMember(slots, other.id, reciprocal, npc.id);
        }
    }

    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    for (const slot of slots) {
        const resolved = [...new Set(slot.resolvedNpcIds)].filter(id => byId.has(id)).slice(0, slot.count);
        slot.resolvedNpcIds = resolved;
        if (familyRole(slot.relation) !== 'child' || resolved.length < 2) continue;
        const isTwin = Boolean(slot.twinGroup || /\btwins?\b/i.test(slot.descriptor));
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
                const keyRelationshipsLocked = (owner.manualProfileFields || []).includes('keyRelationships');
                if (!keyRelationshipsLocked && !hasCounterpart && (owner.keyRelationships || []).length < limit) owner.keyRelationships = normalizeKeyRelationshipEntries([...(owner.keyRelationships || []), other.name + ' - ' + relation], limit, 500);
            }
        }
    }
    state.familySlots = normalizeFamilySlots(slots, validIds);
    state.socialGraph = [...edgeMap.values()].slice(-200);
    state.npcs = state.npcs.map(npc => normalizeNpc(npc));
    return normalizeState(state, state.chatKey);
}

const BIRTHDAY_EVIDENCE_CUES = /\b(?:birthday|birth date|date of birth|born(?:\s+on)?|name day|nameday)\b/i;
function bootstrapBirthdayGrounded(value, context) {
    const birthday = normalizeBirthday(value);
    const source = String(context || '');
    return Boolean(birthday && source.trim() && BIRTHDAY_EVIDENCE_CUES.test(source) && profileEvidenceGrounded(birthday, source));
}

function meaningfulBootstrapProposal(patch, field) {
    if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
    const value = patch?.[field];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Object.keys(value).length > 0;
    return String(value ?? '').trim().length > 0;
}

function bootstrapComparable(value) {
    if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value ?? null);
    return evidenceTextKey(value, 6000);
}

function recordBootstrapDiagnostics(before, after, patch, diagnostics = [], accountedFields = new Set()) {
    for (const field of DOSSIER_SEMANTIC_FIELDS) {
        if (accountedFields.has(field) || !meaningfulBootstrapProposal(patch, field)) continue;
        const changed = bootstrapComparable(before?.[field]) !== bootstrapComparable(after?.[field]);
        diagnostics.push({
            npcId: after?.id || before?.id || '', field, group: dossierFieldGroup(field), channel: 'bootstrap',
            status: changed ? 'applied' : 'rejected-proposal',
            reason: changed ? '' : 'bootstrap-value-rejected-or-normalized-away',
        });
    }
}

// Existing dossiers reach this function after prepareModelLedPayload() has stripped every
// ordinary dossier field. Only identity may still change directly. A genuinely new NPC may
// bootstrap grounded initial dossier values once; later evolution uses semanticUpdates only.
function applyIdentityAndBootstrapPatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const before = structuredClone(npc);
    const next = structuredClone(npc);
    const limits = normalizeDossierLimits(options.dossierLimits);
    const canonicalName = canonicalPatchName(patch);

    if (!locked.has('name') && canonicalName) {
        if (canonicalName !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) {
            next.aliases = appendUnique(next.aliases, [next.name], 10);
        }
        next.name = canonicalName;
    }
    if (!locked.has('aliases')) {
        const aliases = (Array.isArray(patch?.aliases) ? patch.aliases : [])
            .filter(alias => humanIdentityCandidate(alias, patch?.role));
        next.aliases = appendUnique(next.aliases, aliases, 10);
    }
    if (options.isBootstrap !== true) return next;

    const accountedFields = new Set();
    const validBootstrapField = field => {
        if (!Object.prototype.hasOwnProperty.call(patch || {}, field)) return false;
        const issue = dossierFieldValueIssue(field, patch[field]);
        if (!issue) return true;
        accountedFields.add(field);
        options.applicationDiagnostics?.push({
            npcId: next.id || before.id || '', field, group: dossierFieldGroup(field), channel: 'bootstrap',
            status: 'rejected-proposal', reason: 'invalid-value-type:' + issue,
        });
        return false;
    };

    for (const field of ['role', 'species', 'background', 'appearance', 'personality', 'speech', 'mood', 'location', 'goal']) {
        if (!validBootstrapField(field)) continue;
        const value = String(patch[field]).trim();
        if (value) next[field] = value;
    }
    if (validBootstrapField('age')) {
        const age = normalizeActualAge(patch.age);
        if (age) next.age = age;
    }
    if (validBootstrapField('apparentAge')) {
        const apparentAge = normalizeApparentAge(patch.apparentAge);
        if (apparentAge) next.apparentAge = apparentAge;
    }
    if (validBootstrapField('birthday')) {
        const birthday = normalizeBirthday(patch.birthday);
        if (birthday && bootstrapBirthdayGrounded(birthday, options.profileContext)) {
            next.birthday = birthday;
            next.birthdayProvenance = 'explicit';
        }
    }

    if (validBootstrapField('appearanceForms')) {
        const forms = normalizeAppearanceForms(patch.appearanceForms);
        if (forms.length) next.appearanceForms = forms;
    }
    if (validBootstrapField('currentForm')) {
        const requestedForm = String(patch.currentForm).trim().slice(0, 80);
        if (requestedForm) {
            const forms = normalizeAppearanceForms(patch.appearanceForms);
            const matched = forms.find(form => normalizeName(form.name) === normalizeName(requestedForm));
            next.currentForm = matched?.name || requestedForm;
        }
    }
    if (validBootstrapField('status')) {
        const status = normalizeCurrentStatus(patch.status);
        if (status) next.status = status;
    }

    if (validBootstrapField('behaviorProfile')) next.behaviorProfile = normalizeDossierTextCollection('behaviorProfile', patch.behaviorProfile, limits.behaviorProfile, 360);
    if (validBootstrapField('mannerisms')) next.mannerisms = normalizeDossierTextCollection('mannerisms', patch.mannerisms, limits.mannerisms, 280);
    if (validBootstrapField('memories')) next.memories = normalizeMemoryEntries(patch.memories, limits.memories, 700);
    if (validBootstrapField('keyRelationships')) {
        next.keyRelationships = normalizeKeyRelationshipEntries(patch.keyRelationships, limits.keyRelationships, 500)
            .filter(item => !keyRelationshipReferencesPlayer(item, options.playerName));
    }
    recordBootstrapDiagnostics(before, next, patch, options.applicationDiagnostics, accountedFields);
    return next;
}

function socialEdgeKey(edge) {
    const ids = [String(edge.fromId || ''), String(edge.toId || '')].sort();
    return `${ids[0]}\0${ids[1]}\0${normalizeName(edge.relation)}`;
}

function npcEvidenceVariants(npc, patch = null) {
    return [...new Set([npc?.name, ...(npc?.aliases || []), patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : []), patch?.role].map(value => String(value || '').trim()).filter(Boolean))];
}

function visibleShortActivityIdentityMention(state, npc, visibleText = '') {
    for (const candidate of shortActivityIdentityCandidates(npc)) {
        if (!shortActivityIdentityUnique(state, npc, candidate)) continue;
        if (identityTokenMention(visibleText, candidate)) return true;
    }
    return false;
}
function restrictedEvidenceScope(state, patch, policy) {
    if (!policy?.detected) return 'unrestricted';
    const patchId = String(patch?.id || '').trim();
    const existing = patchId ? state.npcs.find(npc => npc.id === patchId) : findNpcByReference(state, patch?.name || '');
    return evidenceReferenceScope(policy, npcEvidenceVariants(existing, patch));
}
function referenceAllowedForActivity(state, reference, policy, channel = 'exchangeActive', patches = [], currentAdmissionText = '') {
    const npc = findNpcByReference(state, reference);
    const patch = activityPatchForReference(state, reference, patches);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const variants = npc ? npcEvidenceVariants(npc, patch) : [reference, patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])].filter(Boolean);
    const sections = structuredReferenceSections(policy, variants);
    // A final structured Off-Screen placement contradicts inChat at the end, but it does not
    // erase exchangeActive participation that may have occurred earlier in the same exchange.
    if (channel === 'inChat' && sections.offscreen && !sections.present) return false;
    if (patch && activityEvidenceVerified(patch, channel, visible)) return true;
    // A valid nonzero relationship proposal already carries exact CURRENT-visible evidence.
    // Let that evidence prove exchange participation as well so identity/presence hardening
    // cannot suppress otherwise-valid relationship scoring merely because an older model or
    // deterministic fixture omitted the newer activityEvidence field.
    if (channel === 'exchangeActive' && patch && relationshipChangeCurrentEvidenceVerified(patch, visible)) return true;
    // Preserve v0.4.20 diagnostic observability for an already-present established NPC:
    // a malformed nonzero proposal must reach relationshipDeltaForPatch so it can be
    // rejected with precise reasons such as missing-axis-evidence. This fallback cannot
    // create a new NPC, cannot establish final presence, and cannot authorize movement.
    const hasRawRelationshipProposal = patch?.relationshipChange?.evaluated === true
        && RELATIONSHIP_AXES.some(axis => Number(patch?.relationshipChange?.delta?.[axis]) !== 0);
    if (channel === 'exchangeActive' && npc?.present === true && hasRawRelationshipProposal) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));
    const shortVisible = npc ? visibleShortActivityIdentityMention(state, npc, visible) : false;
    if (exactVisible || shortVisible) return true;
    // Production always supplies current visible text. Keep empty-context direct callers
    // backward-compatible without weakening real chat provenance checks.
    return !visible && !policy?.detected;
}
function referenceAllowedForWorldActivity(state, reference, policy, patches = [], currentAdmissionText = '') {
    const npc = findNpcByReference(state, reference);
    const patch = activityPatchForReference(state, reference, patches);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const variants = npc ? npcEvidenceVariants(npc, patch) : [reference, patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])].filter(Boolean);
    const sections = structuredReferenceSections(policy, variants);
    // Structured final placement is authoritative only as a structural section invariant:
    // Present must not become world-active merely because the name exists in World_State.
    if (sections.present && !sections.offscreen) return false;
    if (sections.offscreen) return true;
    // Pre-sectioned World_State formats historically used the whole block as explicit
    // off-screen live-state context. Preserve that compatibility only when no Present or
    // Off-Screen placement section exists anywhere in the current World_State.
    if (sections.legacyWorld) return true;
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;
    // A visible name alone says only that the NPC was mentioned. It cannot establish that
    // the NPC is currently active somewhere off-screen. Plain-narrative worldActive claims
    // therefore require the model's exact current-visible activityEvidence. Structured
    // Off-Screen placement and legacy unsectioned World_State remain the only non-quote paths.
    return !visible && !policy?.detected;
}
function identityEvidenceRecord(patch) {
    const raw = patch?.identityEvidence;
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
}
function currentVisibleEvidenceText(policy, currentAdmissionText = '') {
    return String(policy?.visibleText || currentAdmissionText || '').trim();
}
function currentVisibleExcerptSources(visibleText = '') {
    const text = String(visibleText || '').trim();
    return text ? [{ id: 'current-visible', kind: 'visible', text }] : [];
}
function verifiedCurrentVisibleExcerpts(record, visibleText = '') {
    const excerpts = Array.isArray(record?.excerpts) ? record.excerpts.map(value => String(value || '').trim()).filter(Boolean) : [];
    if (!excerpts.length || excerpts.length > 3) return false;
    const sources = currentVisibleExcerptSources(visibleText);
    return Boolean(sources.length && excerpts.every(excerpt => relationshipEvidenceExcerptMatch(excerpt, sources)));
}
function identityEvidenceVerified(patch, policy, currentAdmissionText = '') {
    const record = identityEvidenceRecord(patch);
    if (!record) return null;
    const anchor = humanIdentityCandidate(record.anchor, patch?.role);
    const explanation = String(record.explanation || '').trim();
    const canonicalName = canonicalPatchName(patch, []);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    if (!anchor || !explanation || !canonicalName || !visible) return null;
    if (!containsNormalizedPhrase(canonicalName, anchor) && normalizeName(canonicalName) !== normalizeName(anchor)) return null;
    if (!containsNormalizedPhrase(visible, anchor)) return null;
    if (!verifiedCurrentVisibleExcerpts(record, visible)) return null;
    return { anchor, explanation };
}
function activityEvidenceVerified(patch, channel, visibleText = '') {
    const activity = patch?.activityEvidence;
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return false;
    const record = activity?.[channel];
    return Boolean(record && typeof record === 'object' && !Array.isArray(record) && verifiedCurrentVisibleExcerpts(record, visibleText));
}
function relationshipChangeCurrentEvidenceVerified(patch, visibleText = '') {
    const change = patch?.relationshipChange;
    if (!change || typeof change !== 'object' || Array.isArray(change)) return false;
    for (const axis of RELATIONSHIP_AXES) {
        if (!Number(change?.delta?.[axis])) continue;
        const record = change?.axisEvidence?.[axis];
        if (record && verifiedCurrentVisibleExcerpts(record, visibleText)) return true;
    }
    return false;
}
function activityPatchForReference(state, reference, patches = []) {
    const direct = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (direct) return direct;
    const npc = findNpcByReference(state, reference);
    if (!npc) return null;
    return (Array.isArray(patches) ? patches : []).find(item => String(item?.id || '').trim() === npc.id || patchReferenceMatches(item, npc.name)) || null;
}
function structuredReferenceSections(policy, variants = []) {
    const values = [...new Set((Array.isArray(variants) ? variants : [variants]).map(value => String(value || '').trim()).filter(Boolean))];
    const present = values.some(value => containsNormalizedPhrase(policy?.worldPresentText || '', value));
    const offscreen = values.some(value => containsNormalizedPhrase(policy?.worldOffscreenText || '', value));
    const hasPlacementSections = Boolean(String(policy?.worldPresentText || '').trim() || String(policy?.worldOffscreenText || '').trim());
    const legacyWorld = !hasPlacementSections && values.some(value => containsNormalizedPhrase(policy?.worldStateText || '', value));
    return { present, offscreen, legacyWorld };
}
function identityAnchorUnique(state, patch, anchor, patches = []) {
    const key = normalizeName(anchor);
    if (!key) return false;
    const owners = new Set();
    for (const npc of state?.npcs || []) {
        for (const label of [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]) {
            if (containsNormalizedPhrase(label, anchor)) owners.add('npc:' + npc.id);
        }
    }
    for (const candidate of Array.isArray(patches) ? patches : []) {
        const name = canonicalPatchName(candidate, []);
        if (!name || !containsNormalizedPhrase(name, anchor)) continue;
        owners.add('patch:' + normalizeName(name));
    }
    const target = 'patch:' + normalizeName(canonicalPatchName(patch, []));
    return owners.size === 1 && owners.has(target);
}
function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = '') {
    const source = String(currentAdmissionText || '').trim();
    if (!source) return true;
    const variants = [...new Set([
        patch?.name,
        ...(Array.isArray(patch?.aliases) ? patch.aliases : []),
        patch?.role,
    ].map(value => String(value || '').trim()).filter(value => value && !isTechnicalNpcIdentity(value) && !GENERIC_REFERENCES.has(normalizeName(value))))];
    return variants.some(value => containsNormalizedPhrase(source, value));
}

const WORLD_IDENTITY_GENERIC_ROLE_HEADS = new Set([
    'person', 'people', 'someone', 'somebody', 'stranger', 'figure', 'individual',
    'man', 'woman', 'boy', 'girl', 'child', 'adult', 'youth', 'elder',
]);
const WORLD_IDENTITY_INTRO_WORDS = new Set([
    'a', 'an', 'the', 'this', 'that', 'young', 'old', 'older', 'elderly', 'female', 'male', 'another', 'same',
]);
function roleIdentityCues(role = '') {
    const out = [];
    const seen = new Set();
    for (const raw of String(role || '').split(/[\/|;,()[\]{}]+/)) {
        const phrase = evidenceTextKey(raw, 240);
        if (!phrase) continue;
        if (!seen.has(phrase)) { seen.add(phrase); out.push(phrase); }
        const words = phrase.split(/\s+/).filter(Boolean);
        const head = words.at(-1) || '';
        if (head.length >= 4 && !WORLD_IDENTITY_GENERIC_ROLE_HEADS.has(head) && !seen.has(head)) {
            seen.add(head);
            out.push(head);
        }
    }
    return out;
}
function visibleRoleIntroductionForPatch(patch, visibleText = '') {
    const source = evidenceTextKey(visibleText, 50000);
    if (!source) return false;
    const words = source.split(/\s+/).filter(Boolean);
    for (const cue of roleIdentityCues(patch?.role)) {
        if (cue.includes(' ')) {
            if (containsNormalizedPhrase(source, cue)) return true;
            continue;
        }
        for (let index = 0; index < words.length; index += 1) {
            if (words[index] !== cue) continue;
            const prefix = words.slice(Math.max(0, index - 4), index);
            if (prefix.some(word => WORLD_IDENTITY_INTRO_WORDS.has(word))) return true;
        }
    }
    return false;
}
function worldStateIdentityBridgesVisibleIntroduction(state, patch, policy, currentAdmissionText = '', patches = []) {
    if (!policy?.detected) return false;
    const canonicalName = canonicalPatchName(patch, []);
    if (!canonicalName || looksLikeRoleLabel(canonicalName, patch?.role)) return false;
    const structuredCanonical = containsNormalizedPhrase(policy.worldPresentText || '', canonicalName)
        || containsNormalizedPhrase(policy.worldOffscreenText || '', canonicalName);
    if (!structuredCanonical) return false;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const identity = identityEvidenceVerified(patch, policy, currentAdmissionText);
    if (identity && identityAnchorUnique(state, patch, identity.anchor, patches)) return true;
    // Preserve the older role bridge as a compatibility fallback, but only for explicit
    // Present/Off-Screen sections rather than any arbitrary World_State occurrence.
    return visibleRoleIntroductionForPatch(patch, visible);
}
function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '', patches = []) {
    if (findNpcByReference(state, patch?.name || '')) return true;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const directlyMentioned = newPatchMentionedInCurrentExchange(patch, visible);
    if (directlyMentioned) return true;
    const scope = restrictedEvidenceScope(state, patch, policy);
    if (scope === 'inner' || scope === 'excluded') return false;
    if (scope === 'world') return worldStateIdentityBridgesVisibleIntroduction(state, patch, policy, visible, patches);
    return false;
}
function newReferenceAllowedByWorldIdentityBridge(state, reference, patches, policy, currentAdmissionText = '', channel = 'exchangeActive') {
    const patch = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (!patch) return false;
    const patchId = String(patch?.id || '').trim();
    if (patchId && state.npcs.some(item => item.id === patchId)) return false;
    const canonicalName = canonicalPatchName(patch, [reference]);
    if (!canonicalName || findNpcByReference(state, canonicalName)) return false;
    if (!newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText, patches)) return false;
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    if (activityEvidenceVerified(patch, channel, visible)) return true;
    if (containsNormalizedPhrase(visible, canonicalName)) return true;
    if (identityEvidenceVerified(patch, policy, currentAdmissionText)) return true;
    return visibleRoleIntroductionForPatch(patch, visible);
}

const ROLE_LABEL_MODIFIERS = new Set([
    'north','northern','south','southern','east','eastern','west','western','upper','lower','inner','outer','front','rear',
    'first','second','third','senior','junior','night','day','city','town','village','castle','palace','guild','gate','door',
    'dock','harbor','market','temple','road','bridge','watch','local','royal','main','outermost','inner-most',
]);
function looksLikeRoleLabel(name, role) {
    const nameKey = normalizeName(name);
    const roleKey = normalizeName(role);
    if (!nameKey) return true;
    if (!roleKey) return false;
    if (nameKey === roleKey) return true;
    const roleTokens = roleKey.split(/\s+/).filter(Boolean);
    const nameTokens = nameKey.split(/\s+/).filter(Boolean);
    if (roleTokens.length && nameTokens.length >= roleTokens.length) {
        const tail = nameTokens.slice(-roleTokens.length).join(' ');
        if (tail === roleKey) {
            const prefix = nameTokens.slice(0, -roleTokens.length);
            if (prefix.length && prefix.every(token => ROLE_LABEL_MODIFIERS.has(token))) return true;
        }
    }
    return false;
}

export function newNpcAdmissionAllows(patch, mode = 'balanced', referenceCandidates = []) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'balanced') return true;
    if (policy === 'manual') return false;
    const kind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    if (['role-label', 'role', 'unnamed'].includes(kind)) return false;
    const name = canonicalPatchName(patch, referenceCandidates);
    if (!name || looksLikeRoleLabel(name, patch?.role)) return false;
    if (['named', 'proper-name', 'proper'].includes(kind)) return true;
    return true;
}

export function applyScanResult(stateInput, resultInput, options = {}) {
    const state = normalizeState(stateInput, stateInput?.chatKey || '');
    // scanner.js owns parsing/compatibility once, before identity preparation.
    const result = resultInput;
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : state.turn;
    const preservePresence = options.preservePresence === true;
    const applyRelationship = options.applyRelationship !== false;
    const allowHistoricalProfilePatches = options.allowHistoricalProfilePatches === true;
    const playerName = resolvePlayerName(options.playerName);
    const dossierLimits = normalizeDossierLimits(options.dossierLimits);
    const admissionMode = normalizeNpcAdmissionMode(options.admissionMode);

    state.npcs = state.npcs.map(npc => repairTechnicalStoredName(sanitizePlayerKeyRelationships(npc, playerName)));

    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;
    const currentAdmissionText = String(options.currentAdmissionText || '').trim();
    const newActivityBridge = (ref, channel) => newReferenceAllowedByWorldIdentityBridge(state, ref, result.npcs, evidencePolicy, currentAdmissionText, channel);
    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'exchangeActive', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'exchangeActive'));
    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'inChat', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'inChat'));
    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy, result.npcs, currentAdmissionText));
    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);
    preflightAutomaticIdentityPatches(state, result.npcs, identityRefs);
    // A new returned dossier may contain a bad machine-shaped name even when the same
    // payload also contains its real human name in aliases/activity references. Resolve the
    // human-facing identity first and bootstrap only from that canonical display name.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = canonicalPatchName(patch, identityRefs);
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !findNpcByReference(state, name)
                && newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs)
                && newNpcAdmissionAllows(patch, admissionMode, identityRefs);
        })
        .map(patch => canonicalPatchName(patch, identityRefs)));
    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];

    const deletedIds = new Set(state.deletedNpcIds || []);
    const createdNpcIds = new Set();
    const patchByNpcId = new Map();
    const applicationDiagnostics = [];
    // Runtime-only handoff. One deterministic identity/admission decision is reused by
    // every downstream consumer; model transport ids never become stored identity authority.
    const patchResolutions = [];
    const setPatchResolution = (patchIndex, status, npcId = '', reason = '') => {
        patchResolutions[patchIndex] = {
            patchIndex,
            status,
            npcId: String(npcId || '').slice(0, 180),
            reason: String(reason || '').slice(0, 220),
        };
    };
    const acceptedNpcForPatchIndex = patchIndex => {
        const resolution = patchResolutions[patchIndex];
        if (resolution?.status !== 'accepted' || !resolution.npcId) return null;
        return state.npcs.find(item => item.id === resolution.npcId) || null;
    };
    const acceptedNpcForReference = reference => {
        for (let patchIndex = 0; patchIndex < result.npcs.length; patchIndex += 1) {
            if (!patchReferenceMatches(result.npcs[patchIndex], reference)) continue;
            const npc = acceptedNpcForPatchIndex(patchIndex);
            if (npc) return npc;
        }
        return null;
    };

    for (let patchIndex = 0; patchIndex < result.npcs.length; patchIndex += 1) {
        const patch = result.npcs[patchIndex];
        const patchId = String(patch?.id || '').trim();
        if (patchId && deletedIds.has(patchId)) {
            setPatchResolution(patchIndex, 'rejected', '', 'deleted-npc-id');
            continue;
        }
        const canonicalName = canonicalPatchName(patch, identityRefs);
        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        if (!npc && canonicalName) {
            // Unknown model ids are transport hints only. Grounded canonical identity may
            // resolve an existing dossier or be admitted under a locally allocated id.
            npc = findNpcByReference(state, canonicalName);
        }
        const conflict = automaticIdentityPatchConflict(state, npc, patch, identityRefs);
        if (conflict) {
            setPatchResolution(patchIndex, 'rejected', '', 'identity-conflict:' + conflict.value);
            continue;
        }
        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));
        if (!npc) {
            if (!referenced) {
                setPatchResolution(patchIndex, 'unresolved', '', 'not-referenced');
                continue;
            }
            if (!newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs)) {
                setPatchResolution(patchIndex, 'unresolved', '', 'identity-evidence-unresolved');
                continue;
            }
            if (!newNpcAdmissionAllows(patch, admissionMode, identityRefs)) {
                setPatchResolution(patchIndex, 'rejected', '', 'admission-policy-rejected');
                continue;
            }
            const created = createFromPatch(patch, sourceMessageId, identityRefs);
            if (!created) {
                setPatchResolution(patchIndex, 'unresolved', '', 'invalid-canonical-identity');
                continue;
            }
            if (deletedIds.has(created.id)) {
                setPatchResolution(patchIndex, 'rejected', '', 'deleted-npc-id');
                continue;
            }
            if ((state.suppressedNames || []).some(name => normalizeName(name) === normalizeName(created.name))) {
                setPatchResolution(patchIndex, 'rejected', '', 'suppressed-identity');
                continue;
            }
            state.npcs.push(created);
            createdNpcIds.add(created.id);
            npc = created;
        }
        patchByNpcId.set(npc.id, patch);
        setPatchResolution(patchIndex, 'accepted', npc.id, '');
    }

    const resolveRefs = refs => {
        const ids = [];
        for (const ref of refs) {
            const npc = findNpcByReference(state, ref) || acceptedNpcForReference(ref);
            if (npc && !ids.includes(npc.id)) ids.push(npc.id);
        }
        return ids;
    };

    const exchangeIds = resolveRefs(exchangeRefs);
    const presentIds = resolveRefs(presentRefs);
    // Final presence is single-valued: a malformed proposal cannot leave the same NPC both
    // in-chat and off-screen. In-chat wins because it is the stronger current-scene claim.
    const worldIds = resolveRefs(worldRefs).filter(id => !presentIds.includes(id));
    const bootstrapIds = resolveRefs(bootstrapRefs);
    const targetIds = [...new Set([...exchangeIds, ...presentIds, ...bootstrapIds])];
    const targetSet = new Set(targetIds);
    const exchangeSet = new Set(exchangeIds);
    const worldSet = new Set(worldIds);
    const lifeStateUpdateByNpcId = new Map();
    for (const raw of result.lifeStateUpdates || []) {
        const refs = [raw?.id, raw?.name, raw?.target].filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean);
        const target = refs.map(ref => findNpcByReference(state, ref)).find(Boolean) || null;
        if (!target || lifeStateUpdateByNpcId.has(target.id)) continue;
        lifeStateUpdateByNpcId.set(target.id, { ...structuredClone(raw), id: target.id, name: target.name });
    }
    // A returned dossier patch is itself meaningful structured output. When enabled by the
    // caller, apply it even if the model imperfectly omitted this existing NPC from the
    // activity arrays. Keep world-only NPCs on their restricted live-state path unless they
    // are also an exchange/in-chat target. Relationship deltas remain exchange-gated.
    const privateEvidenceSet = new Set();
    const excludedEvidenceSet = new Set();
    for (const [id, patch] of patchByNpcId.entries()) {
        const existing = state.npcs.find(npc => npc.id === id);
        const scope = evidenceReferenceScope(evidencePolicy, npcEvidenceVariants(existing, patch));
        if (scope === 'inner' && !targetSet.has(id) && !worldSet.has(id)) privateEvidenceSet.add(id);
        if (scope === 'excluded' && !targetSet.has(id) && !worldSet.has(id)) excludedEvidenceSet.add(id);
    }
    const returnedPatchSet = new Set([...patchByNpcId.keys()].filter(id => (!worldSet.has(id) || targetSet.has(id)) && !privateEvidenceSet.has(id) && !excludedEvidenceSet.has(id)));
    const acceptedPatchNpcIds = new Set(patchResolutions
        .filter(row => row?.status === 'accepted' && row.npcId)
        .map(row => row.npcId));
    const currentVisibleText = currentVisibleEvidenceText(evidencePolicy, currentAdmissionText);
    const acceptedExchangeActivityEvidence = [...patchByNpcId.entries()].map(([npcId, candidatePatch]) => {
        const record = candidatePatch?.activityEvidence?.exchangeActive;
        const accepted = acceptedPatchNpcIds.has(npcId)
            && exchangeSet.has(npcId)
            && activityEvidenceVerified(candidatePatch, 'exchangeActive', currentVisibleText);
        return {
            npcId,
            excerpts: accepted && Array.isArray(record?.excerpts)
                ? record.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)
                : [],
        };
    }).filter(row => row.excerpts.length);
    const unambiguousActivityExcerptsForNpc = npcId => {
        const own = acceptedExchangeActivityEvidence.find(row => row.npcId === npcId)?.excerpts || [];
        return own.filter(excerpt => !acceptedExchangeActivityEvidence.some(row => row.npcId !== npcId
            && row.excerpts.some(other => containsNormalizedPhrase(excerpt, other) || containsNormalizedPhrase(other, excerpt))));
    };

    for (let i = 0; i < state.npcs.length; i += 1) {
        let npc = state.npcs[i];
        const storedStatusBeforePatch = String(npc?.status || '');
        const patch = patchByNpcId.get(npc.id);
        const lifecyclePatch = lifeStateUpdateByNpcId.get(npc.id) || null;
        const canPatch = Boolean(patch && (targetSet.has(npc.id) || allowHistoricalProfilePatches || (options.applyReturnedNpcPatches === true && returnedPatchSet.has(npc.id))));
        if (canPatch) {
            npc = applyIdentityAndBootstrapPatch(npc, patch, { playerName, dossierLimits, isBootstrap: createdNpcIds.has(npc.id), profileContext: String(options.profileContext || ''), applicationDiagnostics });
            if (!lifecyclePatch) npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });
            const relationshipOptions = {
                relationshipCaps: options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS,
                relationshipContext: String(options.relationshipContext || ''),
                relationshipEvidenceSources: Array.isArray(options.evidencePolicy?.relationshipSources) ? options.evidencePolicy.relationshipSources : [],
                playerName,
                otherNpcNames: state.npcs.filter(other => other.id !== npc.id).flatMap(other => [other.name, ...(other.aliases || [])]),
                relationshipSummaryTargetBinding: (() => {
                    const activityRecord = patch?.activityEvidence?.exchangeActive;
                    const activityEvidenceAccepted = Boolean(exchangeSet.has(npc.id)
                        && activityEvidenceVerified(patch, 'exchangeActive', currentVisibleText));
                    const identityRecord = identityEvidenceRecord(patch);
                    const identityEvidenceAccepted = Boolean(identityEvidenceVerified(patch, evidencePolicy, currentAdmissionText));
                    return {
                        npcId: npc.id,
                        identityAccepted: acceptedPatchNpcIds.has(npc.id),
                        exchangeActiveAccepted: exchangeSet.has(npc.id),
                        activityEvidenceAccepted,
                        activityEvidenceExcerpts: activityEvidenceAccepted
                            ? unambiguousActivityExcerptsForNpc(npc.id)
                            : [],
                        identityEvidenceAccepted,
                        identityEvidenceExcerpts: identityEvidenceAccepted && Array.isArray(identityRecord?.excerpts)
                            ? identityRecord.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)
                            : [],
                    };
                })(),
                // Automatic relationship movement is always current-exchange evidence.
                // Existing NPCs are not allowed to bypass grounding merely because their
                // dossier already exists. Direct/manual relationship editing uses engine
                // mutation and does not pass through this scanner path.
                requireCurrentRelationshipEvidence: createdNpcIds.has(npc.id) || Boolean(String(options.relationshipContext || '').trim()),
                sourceMessageId,
                turn,
                relationshipSummaryDiagnostics: applicationDiagnostics,
            };
            if (applyRelationship && exchangeSet.has(npc.id)) npc = applyRelationshipChange(npc, patch, relationshipOptions);
            if (exchangeSet.has(npc.id) || options.reconcileRelationshipSummary === true || (options.repairRelationshipSummary === true && targetSet.has(npc.id))) {
                npc = applyRelationshipSummaryProjection(npc, patch, {
                    ...relationshipOptions,
                    repairRelationshipSummary: options.repairRelationshipSummary === true,
                    reconcileRelationshipSummary: options.reconcileRelationshipSummary === true,
                });
            }
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        } else if (patch && worldSet.has(npc.id) && !lifecyclePatch) {
            // Ordinary off-screen dossier fields are handled later by the same field-scoped
            // semantic pipeline; core retains only lifecycle compatibility here.
            npc = applyLifeState(npc, patch, { ...options, state, storedStatus: storedStatusBeforePatch });
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        }
        if (lifecyclePatch) {
            npc = applyLifeState(npc, lifecyclePatch, { ...options, state, storedStatus: storedStatusBeforePatch });
            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);
        }
        if (applyRelationship && exchangeSet.has(npc.id) && !patch) {
            npc = relationshipEvaluationDiagnostic(npc, null, { sourceMessageId, turn });
        }
        if (options.supplementalPass !== true && exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;
        if (options.supplementalPass !== true && presentIds.includes(npc.id)) {
            npc.lastSeenMessageId = sourceMessageId;
            npc.seenCount = Math.max(0, Number(npc.seenCount) || 0) + 1;
        }
        state.npcs[i] = normalizeNpc(npc);
    }

    if (!preservePresence) {
        const presentSet = new Set(presentIds);
        state.npcs = state.npcs.map(raw => {
            const npc = structuredClone(raw);
            npc.present = !npc.archived && presentSet.has(npc.id);
            npc.worldActive = !npc.archived && worldSet.has(npc.id);
            return normalizeNpc(npc);
        });
    }

    const resolveReturnedReference = reference =>
        findNpcByReference(state, reference) || acceptedNpcForReference(reference);
    const edgeMap = new Map((state.socialGraph || []).map(edge => [socialEdgeKey(edge), edge]));
    for (const raw of result.socialEdges) {
        if (keyRelationshipReferencesPlayer(raw?.from, playerName) || keyRelationshipReferencesPlayer(raw?.to, playerName)) continue;
        const from = resolveReturnedReference(raw?.from);
        const to = resolveReturnedReference(raw?.to);
        if (!from || !to || from.id === to.id) continue;
        const returnedPair = options.applyReturnedNpcPatches === true && returnedPatchSet.has(from.id) && returnedPatchSet.has(to.id);
        if (!targetSet.has(from.id) && !targetSet.has(to.id) && !allowHistoricalProfilePatches && !returnedPair) continue;
        const relation = typeof raw?.relation === 'string' ? raw.relation.trim().slice(0, 160) : '';
        if (!relation) continue;
        const provenance = typeof raw?.provenance === 'string' && ['explicit', 'strong-context'].includes(raw.provenance) ? raw.provenance : 'explicit';
        const summary = typeof raw?.summary === 'string' ? raw.summary.trim().slice(0, 500) : '';
        const edge = { fromId: from.id, toId: to.id, relation, summary, updatedAt: Date.now(), sourceMessageId, provenance, confidence: provenance === 'explicit' ? 1 : 0.8, inferred: false };
        edgeMap.set(socialEdgeKey(edge), edge);
    }
    state.socialGraph = [...edgeMap.values()].slice(-200);
    if (options.reconcileFamilyGraph !== false) {
        addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''), playerName);
        const familyReconciled = reconcileFamilyGraphState(state, { sourceMessageId, dossierLimits });
        state.npcs = familyReconciled.npcs;
        state.socialGraph = familyReconciled.socialGraph;
        state.familySlots = familyReconciled.familySlots;
    }

    // Passive birthday fill is metadata only. It applies after grounded reconciliation to
    // participating dossiers, and never manufactures ageChange or age-progression authority.
    const birthdayFillIds = new Set([...targetIds, ...returnedPatchSet]);
    if (options.birthdayFill && birthdayFillIds.size) {
        state.npcs = state.npcs.map(raw => birthdayFillIds.has(raw.id)
            ? normalizeNpc(applyBirthdayFill(raw, options.birthdayFill))
            : raw);
    }

    if (options.preserveObservation !== true) {
        state.lastObservation = {
            messageId: sourceMessageId,
            exchangeActiveNpcIds: exchangeIds,
            finalPresentNpcIds: presentIds,
            worldActiveNpcIds: worldIds,
            targetNpcIds: targetIds,
        };
        state.lastScannedMessageId = sourceMessageId;
    }
    state.updatedAt = Date.now();
    return {
        state: normalizeState(state, state.chatKey),
        exchangeActiveNpcIds: exchangeIds,
        finalPresentNpcIds: presentIds,
        worldActiveNpcIds: worldIds,
        targetNpcIds: targetIds,
        patchResolutions: patchResolutions.map(row => row ? structuredClone(row) : null),
        applicationDiagnostics: applicationDiagnostics.map(row => structuredClone(row)),
    };
}
