import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing display-name authority marker: ' + label);
    return source.replace(from, to);
}

let scanner = read('v03/scanner.js');

scanner = replaceRequired(
    scanner,
    `function patchReferenceMatches(patch, reference) {
    const key = normalizeName(reference);
    if (!key) return false;
    if (String(patch?.id || '').trim() === String(reference || '').trim()) return true;
    if (normalizeName(patch?.name) === key) return true;
    return (Array.isArray(patch?.aliases) ? patch.aliases : []).some(alias => normalizeName(alias) === key);
}

function createFromPatch(patch, sourceMessageId) {
    const name = String(patch?.name || '').trim();
    if (!name || GENERIC_REFERENCES.has(normalizeName(name))) return null;
    return normalizeNpc({
        // Never trust a model-supplied id for a dossier that does not already exist.
        // Stable ids are allocated by NPC State itself from the canonical returned name.
        id: makeNpcId(name, \`${'${sourceMessageId}-${Math.random()}'}\`),
        name,
        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
        createdAt: Date.now(),
    });
}

function applyStablePatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
    const limits = normalizeDossierLimits(options.dossierLimits);
    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'appearance', 'personality', 'speech', 'background'];
    for (const field of stringFields) {
        if (locked.has(field)) continue;
        const value = field === 'apparentAge'
            ? normalizeApparentAge(patch?.[field])
            : String(patch?.[field] ?? '').trim();
        if (!value) continue;
        if (field === 'name' && value !== next.name && next.name) next.aliases = appendUnique(next.aliases, [next.name], 10);
        next[field] = value;
    }
    if (!locked.has('aliases')) next.aliases = appendUnique(next.aliases, patch?.aliases, 10);`,
    `function isTechnicalNpcIdentity(value) {
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
    return Boolean(machine && human && (machine === human || \` ${'${machine}'} \`.includes(\` ${'${human}'} \`)));
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
        const aWords = normalizeName(a).split(/\\s+/).filter(Boolean).length;
        const bWords = normalizeName(b).split(/\\s+/).filter(Boolean).length;
        return bWords - aWords || b.length - a.length;
    });
    return candidates[0] || '';
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
        id: makeNpcId(name, \`${'${sourceMessageId}-${Math.random()}'}\`),
        name,
        firstSeenMessageId: Number.isInteger(sourceMessageId) ? sourceMessageId : null,
        createdAt: Date.now(),
    });
}

function applyStablePatch(npc, patch, options = {}) {
    const locked = new Set(npc.manualProfileFields || []);
    const next = structuredClone(npc);
    const limits = normalizeDossierLimits(options.dossierLimits);
    const canonicalName = canonicalPatchName(patch);
    const stringFields = ['name', 'role', 'species', 'age', 'apparentAge', 'appearance', 'personality', 'speech', 'background'];
    for (const field of stringFields) {
        if (locked.has(field)) continue;
        const value = field === 'name'
            ? canonicalName
            : (field === 'apparentAge' ? normalizeApparentAge(patch?.[field]) : String(patch?.[field] ?? '').trim());
        if (!value) continue;
        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);
        next[field] = value;
    }
    if (!locked.has('aliases')) {
        const safeAliases = (Array.isArray(patch?.aliases) ? patch.aliases : []).filter(alias => humanIdentityCandidate(alias, patch?.role));
        next.aliases = appendUnique(next.aliases, safeAliases, 10);
    }`,
    'identity helper/create/stable patch block',
);

scanner = replaceRequired(
    scanner,
    `    state.npcs = state.npcs.map(npc => sanitizePlayerKeyRelationships(npc, playerName));

    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);
    const presentRefs = uniqueStrings(result.finalPresentNpcIds);
    const worldRefs = uniqueStrings(result.worldActiveNpcIds);
    // New idless patches are themselves explicit bootstrap observations. Trust them as
    // bootstrap candidates so an imperfect reference array cannot silently discard the
    // second or third new NPC from an otherwise valid embedded scan. The prompt forbids
    // background/mentioned-only characters from being emitted as new npcs entries.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = String(patch?.name || '').trim();
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !GENERIC_REFERENCES.has(normalizeName(name)) && !findNpcByReference(state, name);
        })
        .map(patch => String(patch.name).trim()));
    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];`,
    `    state.npcs = state.npcs.map(npc => repairTechnicalStoredName(sanitizePlayerKeyRelationships(npc, playerName)));

    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds);
    const presentRefs = uniqueStrings(result.finalPresentNpcIds);
    const worldRefs = uniqueStrings(result.worldActiveNpcIds);
    const identityRefs = uniqueStrings([...exchangeRefs, ...presentRefs, ...worldRefs]);
    // A new returned dossier may contain a bad machine-shaped name even when the same
    // payload also contains its real human name in aliases/activity references. Resolve the
    // human-facing identity first and bootstrap only from that canonical display name.
    const bootstrapRefs = uniqueStrings(result.npcs
        .filter(patch => {
            const patchId = String(patch?.id || '').trim();
            const name = canonicalPatchName(patch, identityRefs);
            const knownId = Boolean(patchId && state.npcs.some(item => item.id === patchId));
            return !knownId && name && !findNpcByReference(state, name);
        })
        .map(patch => canonicalPatchName(patch, identityRefs)));
    const targetRefs = [...new Set([...exchangeRefs, ...presentRefs, ...bootstrapRefs])];`,
    'bootstrap canonical display-name refs',
);

scanner = replaceRequired(
    scanner,
    `        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        if (!npc && patch?.name) {
            // Unknown model ids are never authoritative. Exact canonical name/alias may
            // still reconcile the returned patch to an existing dossier safely.
            npc = findNpcByReference(state, String(patch.name));
        }
        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));
        if (!npc && referenced) {
            const created = createFromPatch(patch, sourceMessageId);`,
    `        const canonicalName = canonicalPatchName(patch, identityRefs);
        let npc = patchId ? state.npcs.find(item => item.id === patchId) || null : null;
        if (!npc && canonicalName) {
            // Unknown model ids are never authoritative. Resolve through the grounded
            // human-facing canonical name/alias instead of the model's transport key.
            npc = findNpcByReference(state, canonicalName);
        }
        const referenced = targetRefs.some(ref => patchReferenceMatches(patch, ref)) || worldRefs.some(ref => patchReferenceMatches(patch, ref));
        if (!npc && referenced) {
            const created = createFromPatch(patch, sourceMessageId, identityRefs);`,
    'main bootstrap canonical name',
);

scanner = replaceRequired(
    scanner,
    `                    // The first bootstrap pass may already have created this patch under a
                    // locally allocated id. Resolve by its canonical returned name first.
                    npc = patch?.name ? findNpcByReference(state, String(patch.name)) : null;
                    if (!npc) {
                        const created = createFromPatch(patch, sourceMessageId);`,
    `                    // The first bootstrap pass may already have created this patch under a
                    // locally allocated id. Resolve by its human-facing canonical name first.
                    const canonicalName = canonicalPatchName(patch, [...identityRefs, ref]);
                    npc = canonicalName ? findNpcByReference(state, canonicalName) : null;
                    if (!npc) {
                        const created = createFromPatch(patch, sourceMessageId, [...identityRefs, ref]);`,
    'reference resolver canonical name',
);

scanner = replaceRequired(
    scanner,
    `    const resolveReturnedReference = reference => {
        const direct = findNpcByReference(state, reference);
        if (direct) return direct;
        const patch = result.npcs.find(item => patchReferenceMatches(item, reference));
        return patch?.name ? findNpcByReference(state, String(patch.name)) : null;
    };`,
    `    const resolveReturnedReference = reference => {
        const direct = findNpcByReference(state, reference);
        if (direct) return direct;
        const patch = result.npcs.find(item => patchReferenceMatches(item, reference));
        const canonicalName = patch ? canonicalPatchName(patch, [...identityRefs, reference]) : '';
        return canonicalName ? findNpcByReference(state, canonicalName) : null;
    };`,
    'social reference canonical name',
);

write('v03/scanner.js', scanner);

let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "        'For NEW NPC identity: if a proper/personal name is known in this response, npcs.name MUST be that canonical name and nothing else. Put occupation or function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a unique role label as name only while the NPC is genuinely unnamed. Always use id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    "        'For NEW NPC identity: if a proper/personal name is known in this response, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation or function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always use id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    'foreground machine-name ban',
);
injection = replaceRequired(
    injection,
    '"name":"canonical proper name when known; unique role label only if genuinely unnamed"',
    '"name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*"',
    'foreground output display-name contract',
);
write('v03/injection.js', injection);

scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    "        '- For NEW NPC identity: if a proper/personal name is established anywhere in the current exchange, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation/function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always return id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',",
    'recovery machine-name ban',
);
scanner = replaceRequired(
    scanner,
    "            name: 'canonical proper name when known; unique role label only if genuinely unnamed',",
    "            name: 'human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*',",
    'recovery output display-name contract',
);
write('v03/scanner.js', scanner);

let changelog = read('CHANGELOG.md');
const line = '- Hardened new-NPC display-name authority: `npc-*` transport ids/slugs can no longer become dossier names; grounded human aliases/activity references are promoted to the canonical display name, existing bad technical names self-repair when a trustworthy alias exists, and unresolved machine-only identities fail closed instead of polluting the roster.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 display-name authority hardening');
