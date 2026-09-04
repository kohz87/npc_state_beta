import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);
function rep(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing deep-audit marker: ' + label);
    return source.replace(from, to);
}

// ---------------------------------------------------------------------------
// Evidence adapter: only recognized Megumin-style children activate <Blocks>
// semantics, and a truncated recognized master fails closed instead of leaking
// machine/reference content back into ordinary narrative evidence.
// ---------------------------------------------------------------------------
let evidence = read('v03/evidence-adapter.js');
const evidenceFrom = String.raw`const WORLD_TAGS = new Set(['worldstate']);
const INNER_TAGS = new Set(['npcinnerchatter']);

export function analyzeStructuredEvidence(value) {
    const source = String(value ?? '');
    const masters = [];
    const masterPattern = /<Blocks\b[^>]*>([\s\S]*?)<\/Blocks\s*>/gi;
    let match;
    while ((match = masterPattern.exec(source))) masters.push({ full: match[0], body: match[1] || '' });
    if (!masters.length) return { detected: false, visibleText: source, worldStateText: '', innerChatterText: '', excludedText: '', excludedTags: [] };
    let visibleText = source;
    const world = [];
    const inner = [];
    const excluded = [];
    const excludedTags = [];
    for (const master of masters) {
        visibleText = visibleText.replace(master.full, '\n');
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
        let child;
        while ((child = childPattern.exec(master.body))) {
            const tag = String(child[1] || '');
            const body = clean(child[2], 30000);
            const key = normalizeTag(tag);
            if (WORLD_TAGS.has(key)) world.push(body);
            else if (INNER_TAGS.has(key)) inner.push(body);
            else {
                if (body) excluded.push(body);
                if (tag && !excludedTags.includes(tag)) excludedTags.push(tag);
            }
        }
    }
    return {
        detected: true,
        visibleText: clean(visibleText),
        worldStateText: clean(world.join('\n')),
        innerChatterText: clean(inner.join('\n')),
        excludedText: clean(excluded.join('\n')),
        excludedTags: excludedTags.slice(0, 40),
    };
}`;
const evidenceTo = String.raw`const WORLD_TAGS = new Set(['worldstate']);
const INNER_TAGS = new Set(['npcinnerchatter']);
const REFERENCE_TAGS = new Set(['storytracker', 'charactersheet', 'cyoa', 'bonds', 'newnpc', 'npcupdate']);
const RECOGNIZED_BLOCK_TAGS = new Set([...WORLD_TAGS, ...INNER_TAGS, ...REFERENCE_TAGS]);

function masterHasRecognizedTag(body) {
    const pattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>/g;
    let child;
    while ((child = pattern.exec(String(body || '')))) {
        if (RECOGNIZED_BLOCK_TAGS.has(normalizeTag(child[1]))) return true;
    }
    return false;
}

export function analyzeStructuredEvidence(value) {
    const source = String(value ?? '');
    const masters = [];
    const masterPattern = /<Blocks\b[^>]*>([\s\S]*?)<\/Blocks\s*>/gi;
    let match;
    while ((match = masterPattern.exec(source))) {
        const body = match[1] || '';
        if (masterHasRecognizedTag(body)) masters.push({ full: match[0], body });
    }

    // Find a recognized <Blocks> opening with no later closing tag. Once the wrapper is
    // truncated, the safe interpretation is reference/control material, not visible story.
    let malformedStart = -1;
    const openingPattern = /<Blocks\b[^>]*>/gi;
    let opening;
    while ((opening = openingPattern.exec(source))) {
        const closeIndex = source.toLocaleLowerCase().indexOf('</blocks', opening.index + opening[0].length);
        if (closeIndex >= 0) continue;
        const tail = source.slice(opening.index);
        if (masterHasRecognizedTag(tail)) { malformedStart = opening.index; break; }
    }
    const malformedTail = malformedStart >= 0 ? source.slice(malformedStart) : '';
    if (!masters.length && !malformedTail) {
        return { detected: false, malformed: false, visibleText: source, worldStateText: '', innerChatterText: '', excludedText: '', excludedTags: [] };
    }

    let visibleText = source;
    const world = [];
    const inner = [];
    const excluded = [];
    const excludedTags = [];
    for (const master of masters) {
        visibleText = visibleText.replace(master.full, '\n');
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
        let child;
        while ((child = childPattern.exec(master.body))) {
            const tag = String(child[1] || '');
            const body = clean(child[2], 30000);
            const key = normalizeTag(tag);
            if (WORLD_TAGS.has(key)) world.push(body);
            else if (INNER_TAGS.has(key)) inner.push(body);
            else {
                if (body) excluded.push(body);
                if (tag && !excludedTags.includes(tag)) excludedTags.push(tag);
            }
        }
    }
    if (malformedTail) {
        visibleText = visibleText.replace(malformedTail, '\n');
        excluded.push(clean(malformedTail, 30000));
        if (!excludedTags.includes('Malformed_Blocks')) excludedTags.push('Malformed_Blocks');
    }
    return {
        detected: true,
        malformed: Boolean(malformedTail),
        visibleText: clean(visibleText),
        worldStateText: clean(world.join('\n')),
        innerChatterText: clean(inner.join('\n')),
        excludedText: clean(excluded.join('\n')),
        excludedTags: excludedTags.slice(0, 40),
    };
}`;
evidence = rep(evidence, evidenceFrom, evidenceTo, 'structured evidence parser');
evidence = evidence.replace(
    "'STRUCTURED BLOCK EVIDENCE FIREWALL (active because a Megumin <Blocks> master block is present):',",
    "'STRUCTURED BLOCK EVIDENCE FIREWALL (active because recognized Megumin-style <Blocks> content is present):',"
);
write('v03/evidence-adapter.js', evidence);

// ---------------------------------------------------------------------------
// Scanner evidence and state authority hardening.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = rep(scanner,
`function containsNormalizedPhrase(value, phrase) {
    const haystack = normalizeName(value);
    const needle = normalizeName(phrase);
    return Boolean(haystack && needle && \` \${haystack} \`.includes(\` \${needle} \`));
}`,
`function containsNormalizedPhrase(value, phrase) {
    // normalizeName() intentionally caps identity keys at 160 chars. Evidence/search
    // haystacks are not identity keys and must not silently stop matching after char 160.
    const haystack = evidenceTextKey(value, 50000);
    const needle = evidenceTextKey(phrase, 600);
    return Boolean(haystack && needle && \` \${haystack} \`.includes(\` \${needle} \`));
}`,
'long-form phrase matching');
scanner = rep(scanner,
`function profileValueKey(value) {
    if (Array.isArray(value)) return value.map(item => normalizeName(item)).filter(Boolean).join(' | ');
    return normalizeName(value);
}`,
`function profileValueKey(value) {
    if (Array.isArray(value)) return value.map(item => evidenceTextKey(item, 1400)).filter(Boolean).join(' | ');
    return evidenceTextKey(value, 5000);
}`,
'full profile value comparison');
scanner = rep(scanner,
`function relationshipTextTokens(value) {
    return normalizeName(value).split(/\\s+/).filter(token => token.length >= 3);
}

function relationshipTextSimilarity(a, b) {
    const leftText = normalizeName(a);
    const rightText = normalizeName(b);`,
`function relationshipTextTokens(value) {
    return evidenceTextKey(value, 1600).split(/\\s+/).filter(token => token.length >= 3);
}

function relationshipTextSimilarity(a, b) {
    const leftText = evidenceTextKey(a, 1600);
    const rightText = evidenceTextKey(b, 1600);`,
'full relationship evidence comparison');
scanner = rep(scanner,
`function appendProfileEvolutionEvidence(npc, change, field, options = {}) {
    const concept = String(change?.concept || '').trim().slice(0, 180);
    const evidence = String(change?.evidence || '').trim().slice(0, 600);
    if (!concept || !evidence) return;
    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...(npc.profileEvolutionEvidence || []), {
        field,
        mode: String(change?.mode || 'gradual').trim(),
        concept,
        evidence,
        sourceMessageId: Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null,
        turn: Number.isInteger(options.turn) ? options.turn : null,
        at: Date.now(),
    }]);
}`,
`function appendProfileEvolutionEvidence(npc, change, field, options = {}) {
    const concept = String(change?.concept || '').trim().slice(0, 180);
    const evidence = String(change?.evidence || '').trim().slice(0, 600);
    if (!concept || !evidence) return;
    const sourceMessageId = Number.isInteger(options.sourceMessageId) ? options.sourceMessageId : null;
    const turn = Number.isInteger(options.turn) ? options.turn : null;
    const existing = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence);
    const duplicateSource = existing.some(entry =>
        entry.field === field
        && normalizeName(entry.concept) === normalizeName(concept)
        && (sourceMessageId !== null ? entry.sourceMessageId === sourceMessageId : (turn !== null && entry.sourceMessageId == null && entry.turn === turn)));
    if (duplicateSource) return;
    npc.profileEvolutionEvidence = normalizeProfileEvolutionEvidence([...existing, {
        field,
        mode: String(change?.mode || 'gradual').trim(),
        concept,
        evidence,
        sourceMessageId,
        turn,
        at: Date.now(),
    }]);
}`,
'profile evidence source dedupe');
scanner = rep(scanner,
`    const prior = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence).find(entry =>
        entry.field === field
        && normalizeName(entry.concept) === concept
        && (entry.sourceMessageId !== options.sourceMessageId || entry.turn !== options.turn));
    return { apply: Boolean(prior), queue: true, change };`,
`    const prior = normalizeProfileEvolutionEvidence(npc.profileEvolutionEvidence).find(entry => {
        if (entry.field !== field || normalizeName(entry.concept) !== concept) return false;
        // A rescan of the same assistant message may advance the internal turn counter.
        // Message identity is authoritative whenever both sides have one; turn is fallback.
        if (Number.isInteger(entry.sourceMessageId) && Number.isInteger(options.sourceMessageId)) {
            return entry.sourceMessageId !== options.sourceMessageId;
        }
        if (Number.isInteger(entry.turn) && Number.isInteger(options.turn)) return entry.turn !== options.turn;
        return true;
    });
    return { apply: Boolean(prior), queue: true, change };`,
'gradual profile independent-scan requirement');
scanner = rep(scanner,
'function mergeAppearanceFormPatch(existingValue, newValue, revisionValue) {',
"function mergeAppearanceFormPatch(existingValue, newValue, revisionValue, evidenceContext = '') {",
'form revision context signature');
scanner = rep(scanner,
`        const evidence = String(raw.evidence || raw.reason || '').trim();
        if (!evidence) continue;
        const revised = normalizeAppearanceForms([raw])[0];`,
`        const evidence = String(raw.evidence || raw.reason || '').trim();
        if (!evidence) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        const revised = normalizeAppearanceForms([raw])[0];`,
'form revision grounding');
scanner = rep(scanner,
`        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges);`,
`        next.appearanceForms = mergeAppearanceFormPatch(next.appearanceForms, incomingForms, patch?.appearanceFormChanges, String(options.profileContext || ''));`,
'form revision context wiring');
scanner = rep(scanner,
'function mergeKeyRelationshipPatch(existingValue, incomingValue, changesValue, limit) {',
"function mergeKeyRelationshipPatch(existingValue, incomingValue, changesValue, limit, evidenceContext = '') {",
'key relationship removal context signature');
scanner = rep(scanner,
`        const evidence = String(raw.evidence || raw.reason || '').trim();
        const key = normalizeName(raw.other || raw.name || raw.target);
        if (!evidence || !key) continue;
        for (let i = out.length - 1; i >= 0; i -= 1) if (keyRelationshipOtherKey(out[i]) === key) out.splice(i, 1);`,
`        const evidence = String(raw.evidence || raw.reason || '').trim();
        const key = normalizeName(raw.other || raw.name || raw.target);
        if (!evidence || !key) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;
        for (let i = out.length - 1; i >= 0; i -= 1) if (keyRelationshipOtherKey(out[i]) === key) out.splice(i, 1);`,
'key relationship removal grounding');
scanner = rep(scanner,
`        next.keyRelationships = mergeKeyRelationshipPatch(next.keyRelationships, incoming, patch?.keyRelationshipChanges, limits.keyRelationships);`,
`        next.keyRelationships = mergeKeyRelationshipPatch(next.keyRelationships, incoming, patch?.keyRelationshipChanges, limits.keyRelationships, String(options.profileContext || ''));`,
'key relationship removal context wiring');
scanner = rep(scanner,
'function addFamilyFacts(state, facts, resolveReference, sourceMessageId) {',
"function addFamilyFacts(state, facts, resolveReference, sourceMessageId, evidenceContext = '') {",
'family fact context signature');
scanner = rep(scanner,
`        const evidence = String(raw?.evidence || '').trim().slice(0, 600);
        const role = familyRole(relation);
        if (!owner || !role || !relation || !evidence) continue;`,
`        const evidence = String(raw?.evidence || '').trim().slice(0, 600);
        const role = familyRole(relation);
        if (!owner || !role || !relation || !evidence) continue;
        if (String(evidenceContext || '').trim() && !profileEvidenceGrounded(evidence, evidenceContext)) continue;`,
'family fact grounding');
scanner = rep(scanner,
`    addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId);`,
`    addFamilyFacts(state, result.familyFacts, resolveReturnedReference, sourceMessageId, String(options.profileContext || ''));`,
'family fact context wiring');
scanner = rep(scanner,
`function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}`,
`function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}
function referenceAllowedForWorldActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    return scope === 'visible' || scope === 'world';
}`,
'world activity evidence helper');
scanner = rep(scanner,
`    const worldRefs = uniqueStrings(result.worldActiveNpcIds);`,
`    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy));`,
'world activity firewall wiring');
const admissionFrom = String.raw`export function newNpcAdmissionAllows(patch, mode = 'balanced', referenceCandidates = []) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'balanced') return true;
    if (policy === 'manual') return false;
    const kind = String(patch?.identityKind || '').trim().toLocaleLowerCase().replace(/[_ ]+/g, '-');
    if (['role-label', 'role', 'unnamed'].includes(kind)) return false;
    if (['named', 'proper-name', 'proper'].includes(kind)) return true;
    // Weak-model fallback for Named preferred: a human name that merely wraps its declared
    // occupation (Northern Gate Guard / role Guard) is treated as a role label. Otherwise a
    // canonical name/alias may admit. Balanced remains the backwards-compatible default.
    const name = canonicalPatchName(patch, referenceCandidates);
    const nameKey = normalizeName(name);
    const roleKey = normalizeName(patch?.role);
    if (!nameKey) return false;
    if (roleKey && (nameKey === roleKey || containsNormalizedPhrase(nameKey, roleKey))) return false;
    return true;
}`;
const admissionTo = String.raw`const ROLE_LABEL_MODIFIERS = new Set([
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
}`;
scanner = rep(scanner, admissionFrom, admissionTo, 'named-preferred backend authority');
const lifeFrom = String.raw`function applyLifeState(npc, patch, options) {
    const next = structuredClone(npc);
    const lifeState = String(patch?.lifeState || '').trim();
    const certainty = String(patch?.lifeStateCertainty || '').trim();
    const reason = String(patch?.lifeStateReason || '').trim();
    if (patch?.livingReturn === true) {
        next.archived = false;
        next.archiveReason = '';
        next.archivedAt = null;
        next.lifeState = 'alive';
        next.lifeStateCertainty = certainty || 'explicit';
        next.lifeStateReason = reason || 'Explicit living return in current continuity.';
        return next;
    }
    if (['alive', 'dead', 'unknown'].includes(lifeState)) {
        next.lifeState = lifeState;
        next.lifeStateCertainty = certainty;
        if (reason) next.lifeStateReason = reason;
    }
    if (lifeState === 'dead' && ['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase())) {
        next.archived = true;
        next.archiveReason = 'deceased';
        next.archivedAt = Date.now();
        next.present = false;
        next.worldActive = false;
    }
    return next;
}`;
const lifeTo = String.raw`function applyLifeState(npc, patch, options = {}) {
    const next = structuredClone(npc);
    const lifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();
    const certainty = String(patch?.lifeStateCertainty || '').trim();
    const reason = String(patch?.lifeStateReason || '').trim();
    const policy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;
    const lifeContext = policy?.detected
        ? [policy.visibleText, policy.worldStateText].filter(Boolean).join('\n')
        : String(options.profileContext || '');
    const grounded = Boolean(reason && (!lifeContext.trim() || profileEvidenceGrounded(reason, lifeContext)));
    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'
        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');

    // A dead/archived dossier may return only through the explicit livingReturn channel,
    // and that channel must point back to visible/world current-continuity evidence.
    if (patch?.livingReturn === true) {
        if (!grounded) return next;
        next.archived = false;
        next.archiveReason = '';
        next.archivedAt = null;
        next.lifeState = 'alive';
        next.lifeStateCertainty = certainty || 'explicit';
        next.lifeStateReason = reason;
        return next;
    }

    if (lifeState === 'dead') {
        if (!['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase()) || !grounded) return next;
        next.lifeState = 'dead';
        next.lifeStateCertainty = certainty;
        next.lifeStateReason = reason;
        next.archived = true;
        next.archiveReason = 'deceased';
        next.archivedAt = Date.now();
        next.present = false;
        next.worldActive = false;
        return next;
    }

    // Merely outputting alive must never resurrect a confirmed dead dossier.
    if (lifeState === 'alive' && wasDead) return next;
    if (['alive', 'unknown'].includes(lifeState) && grounded) {
        next.lifeState = lifeState;
        next.lifeStateCertainty = certainty;
        next.lifeStateReason = reason;
    }
    return next;
}`;
scanner = rep(scanner, lifeFrom, lifeTo, 'life-state evidence gate');
scanner = scanner.replace(
    "        '- Confirmed death requires explicit current-timeline evidence. Ambiguous danger/injury is not death.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly alive, surviving, resurrected, or physically returned.',",
    "        '- Confirmed death requires explicit current-timeline evidence. Ambiguous danger/injury is not death. lifeStateReason must state the concrete evidence and is backend-grounded against visible narrative or World_State.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly alive, surviving, resurrected, or physically returned. It also requires a grounded lifeStateReason; merely outputting lifeState alive never resurrects a confirmed dead dossier.',"
);
write('v03/scanner.js', scanner);

// ---------------------------------------------------------------------------
// Staleness/reference matching: do not truncate the current exchange at the
// identity-key 160-char cap.
// ---------------------------------------------------------------------------
let stale = read('v03/stale.js');
stale = rep(stale,
`export function referencedNpcIdsFromExchange(state = {}, exchange = null) {
    const source = \`\${String(exchange?.user?.mes || '')}\\n\${String(exchange?.assistant?.mes || '')}\`;
    const haystack = \` \${normalizeName(source)} \`;
    if (!haystack.trim()) return [];
    const ids = [];
    for (const npc of state?.npcs || []) {
        const labels = [npc.name, ...(npc.aliases || [])]
            .map(value => normalizeName(value))
            .filter(value => value.length >= 2);
        if (labels.some(label => haystack.includes(\` \${label} \`))) ids.push(npc.id);
    }
    return [...new Set(ids)];
}`,
`function referenceEvidenceText(value, max = 50000) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\\s\\p{P}\\p{S}]+/gu, ' ').trim().slice(0, max);
}

export function referencedNpcIdsFromExchange(state = {}, exchange = null) {
    const source = \`\${String(exchange?.user?.mes || '')}\\n\${String(exchange?.assistant?.mes || '')}\`;
    const haystack = \` \${referenceEvidenceText(source)} \`;
    if (!haystack.trim()) return [];
    const ids = [];
    for (const npc of state?.npcs || []) {
        const labels = [npc.name, ...(npc.aliases || [])]
            .map(value => referenceEvidenceText(value, 600))
            .filter(value => value.length >= 2);
        if (labels.some(label => haystack.includes(\` \${label} \`))) ids.push(npc.id);
    }
    return [...new Set(ids)];
}`,
'long-form stale reference matching');
write('v03/stale.js', stale);

// ---------------------------------------------------------------------------
// Foreground injection: a currently named returning NPC wins dossier priority,
// and disabling both capture and continuity truly removes the extension prompt.
// ---------------------------------------------------------------------------
let injection = read('v03/injection.js');
const candidatesFrom = String.raw`function activeCandidates(state, limit) {
    return (state?.npcs || []).filter(npc => !npc.archived).sort((a, b) =>
        runtimeNpcSalience(b, state) - runtimeNpcSalience(a, state)
        || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1)
        || Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    ).slice(0, limit);
}`;
const candidatesTo = String.raw`function injectionReferenceText(value, max = 12000) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim().slice(0, max);
}
function currentUserReferencedNpcIds(state, currentUserText = '') {
    const haystack = ' ' + injectionReferenceText(currentUserText) + ' ';
    if (!haystack.trim()) return new Set();
    const ids = new Set();
    for (const npc of state?.npcs || []) {
        const labels = [npc?.name, ...(npc?.aliases || [])]
            .map(value => injectionReferenceText(value, 600))
            .filter(value => value.length >= 2);
        if (labels.some(label => haystack.includes(' ' + label + ' '))) ids.add(npc.id);
    }
    return ids;
}

function activeCandidates(state, limit, currentUserText = '') {
    const explicitlyReferenced = currentUserReferencedNpcIds(state, currentUserText);
    return (state?.npcs || [])
        .filter(npc => !npc.archived || (explicitlyReferenced.has(npc.id) && String(npc.archiveReason || '').toLocaleLowerCase() !== 'deceased'))
        .sort((a, b) =>
            Number(explicitlyReferenced.has(b.id)) - Number(explicitlyReferenced.has(a.id))
            || runtimeNpcSalience(b, state) - runtimeNpcSalience(a, state)
            || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1)
            || Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
        ).slice(0, limit);
}`;
injection = rep(injection, candidatesFrom, candidatesTo, 'current-user dossier priority');
injection = rep(injection,
`    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    const admissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    const candidates = (continuity || capture) ? activeCandidates(state, limit) : [];`,
`    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    if (!capture && !continuity) return '';
    const admissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    const currentUserText = String(settings.foregroundCurrentUserText || '').trim().slice(0, 12000);
    const candidates = activeCandidates(state, limit, currentUserText);`,
'fully disabled prompt and current-user priority wiring');
injection = rep(injection,
`        selectedNpcIds: activeCandidates(state, limit).map(npc => npc.id),`,
`        selectedNpcIds: activeCandidates(state, limit, String(settings.foregroundCurrentUserText || '')).map(npc => npc.id),`,
'diagnostic selection parity');
injection = injection.replace(
    "        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Use it only for an explicit current-exchange correction or real persistent growth/change/evolution, and include concrete evidence. Otherwise omit/null it.',",
    "        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Use it only for an explicit current-exchange correction or real persistent growth/change/evolution, and include concrete evidence copied or faithfully paraphrased from this exchange; the backend verifies that evidence against visible narrative. Otherwise omit/null it.',"
);
injection = injection.replace(
    "        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful. For existing NPCs this array is a counterpart MERGE PATCH, not a whole-list replacement; omission never deletes another established tie. Use keyRelationshipChanges only for explicit removals.',",
    "        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful. For existing NPCs this array is a counterpart MERGE PATCH, not a whole-list replacement; omission never deletes another established tie. Use keyRelationshipChanges only for explicit removals, with evidence copied or faithfully paraphrased from visible current-exchange narration; the backend verifies it.',"
);
injection = injection.replace(
    "        'DURABLE PROFILE EVOLUTION: new NPCs may establish grounded foundational personality/behavior/speech/mannerisms in their first rich scene. For an EXISTING established personality, behaviorProfile, speech, or mannerisms, any real rewrite requires profileChanges with field, mode refine|gradual|explicit|batch, a short stable concept label, and concrete evidence. refine is compatible detail only, not no-longer/became/increasingly change or a morality flip. gradual means sustained same-concept development and may require later confirmation. explicit requires a clearly lasting/corrective change in this exchange. batch requires an actual narrated time skip plus development across it. Never promote a one-off gesture into a mannerism unless narration marks it recurring/habitual.',",
    "        'DURABLE PROFILE EVOLUTION: new NPCs may establish grounded foundational personality/behavior/speech/mannerisms in their first rich scene. For an EXISTING established personality, behaviorProfile, speech, or mannerisms, any real rewrite requires profileChanges with field, mode refine|gradual|explicit|batch, a short stable concept label, and concrete evidence. refine is compatible detail only, not no-longer/became/increasingly change or a morality flip. gradual means sustained same-concept development and requires confirmation from a DIFFERENT assistant message; rescanning the same message never counts twice. explicit requires a clearly lasting/corrective change in this exchange. batch requires an actual narrated time skip plus development across it. Never promote a one-off gesture into a mannerism unless narration marks it recurring/habitual.',\n        'LIFE-STATE AUTHORITY: confirmed death needs explicit current-timeline evidence and a concrete lifeStateReason. A previously dead/deceased dossier may become alive only with livingReturn true plus a grounded reason showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',"
);
write('v03/injection.js', injection);

// ---------------------------------------------------------------------------
// Foreground wiring and diagnostics: pass only the newest visible user message
// as current-turn dossier-priority evidence.
// ---------------------------------------------------------------------------
let index = read('v03/index.js');
index = rep(index,
`function updateInjection() {
    const ctx = getContext();`,
`function latestForegroundUserText(chat = []) {
    const source = Array.isArray(chat) ? chat : [];
    for (let i = source.length - 1; i >= 0; i -= 1) {
        const message = source[i];
        if (!message || message.is_system) continue;
        return message.is_user ? cleanForegroundHistoryText(message.mes).slice(0, 12000) : '';
    }
    return '';
}

function updateInjection() {
    const ctx = getContext();`,
'latest user helper');
index = rep(index,
`    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));
    const foregroundNewNpcHistory = buildForegroundNewNpcHistory(ctx.chat || [], settings);
    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory }) : '';`,
`    const structuredEvidenceDetected = (ctx.chat || []).slice(-30).some(message => hasRecognizedStructuredBlocks(message?.mes));
    const foregroundNewNpcHistory = buildForegroundNewNpcHistory(ctx.chat || [], settings);
    const foregroundCurrentUserText = latestForegroundUserText(ctx.chat || []);
    const prompt = state ? buildInjection(state, { ...settings, structuredEvidenceDetected, foregroundNewNpcHistory, foregroundCurrentUserText }) : '';`,
'foreground current user wiring');
index = rep(index,
`        injection: state ? injectionDiagnostics(state, settings) : null,`,
`        injection: state ? injectionDiagnostics(state, { ...settings, foregroundCurrentUserText: latestForegroundUserText(getContext().chat || []) }) : null,`,
'diagnostic current user wiring');
write('v03/index.js', index);

// ---------------------------------------------------------------------------
// Manual editor integrity: name and alias namespace is globally unique. Manual
// restore of a deceased dossier is authoritative and cannot leave dead+unarchived.
// ---------------------------------------------------------------------------
let engine = read('v03/engine.js');
engine = rep(engine,
`            const next = normalizeNpc(nextRaw);
            const collision = state.npcs.some((npc, i) => i !== index && normalizeName(npc.name) === normalizeName(next.name));
            if (collision) return false;
            if (next.name !== current.name && current.name) next.aliases = [...new Set([...(next.aliases || []), current.name])].slice(0, 10);
            state.npcs[index] = normalizeNpc(next);`,
`            let next = normalizeNpc(nextRaw);
            if (next.name !== current.name && current.name) next.aliases = [...new Set([...(next.aliases || []), current.name])].slice(0, 10);
            next = normalizeNpc(next);
            const nextIdentityKeys = new Set([next.name, ...(next.aliases || [])].map(value => normalizeName(value)).filter(Boolean));
            const collision = state.npcs.some((npc, i) => i !== index && [npc.name, ...(npc.aliases || [])]
                .map(value => normalizeName(value)).filter(Boolean).some(key => nextIdentityKeys.has(key)));
            if (collision) return { rejected: 'identity-collision' };
            state.npcs[index] = next;`,
'manual name-alias collision check');
engine = rep(engine,
`            } else {
                const chat = getContext().chat || [];
                const messageId = latestAssistantMessageId(chat);
                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);`,
`            } else {
                if (String(next.lifeState || '').toLocaleLowerCase() === 'dead' || String(next.archiveReason || '').toLocaleLowerCase() === 'deceased') {
                    next.lifeState = 'alive';
                    next.lifeStateCertainty = 'explicit';
                    next.lifeStateReason = 'Manual dossier restore by player.';
                }
                const chat = getContext().chat || [];
                const messageId = latestAssistantMessageId(chat);
                next.lastActivityTurn = narrativeTurnForMessage(chat, messageId);`,
'manual deceased restore consistency');
write('v03/engine.js', engine);

// ---------------------------------------------------------------------------
// Branch rollback: story checkpoints may rewind story-derived state, but current
// user-locked canon and user-owned Importance survive a swipe/edit rollback.
// ---------------------------------------------------------------------------
let branches = read('v03/branches.js');
branches = rep(branches,
`import { CHECKPOINT_LIMIT, normalizeState, snapshotForCheckpoint } from './schema.js';`,
`import { CHECKPOINT_LIMIT, STABLE_PROFILE_FIELDS, normalizeState, snapshotForCheckpoint } from './schema.js';`,
'branch stable-field import');
const presentationFrom = String.raw`function preserveCurrentPresentation(restored, current) {
    const currentById = new Map((current?.npcs || []).map(npc => [npc.id, npc]));
    restored.npcs = (restored.npcs || []).map(npc => {
        const live = currentById.get(npc.id);
        return live?.portrait ? { ...npc, portrait: structuredClone(live.portrait) } : npc;
    });
    return restored;
}`;
const presentationTo = String.raw`function preserveCurrentPresentation(restored, current) {
    const currentById = new Map((current?.npcs || []).map(npc => [npc.id, npc]));
    const stableFields = new Set(STABLE_PROFILE_FIELDS);
    restored.npcs = (restored.npcs || []).map(npc => {
        const live = currentById.get(npc.id);
        if (!live) return npc;
        const next = { ...npc };
        if (live.portrait) next.portrait = structuredClone(live.portrait);
        const locked = [...new Set(Array.isArray(live.manualProfileFields) ? live.manualProfileFields : [])];
        next.manualProfileFields = structuredClone(locked);
        for (const field of locked) {
            if (stableFields.has(field)) next[field] = structuredClone(live[field]);
        }
        // Importance became editor-owned in 0.4.3, so branch history must not undo it.
        next.importance = Number(live.importance) || 0;
        return next;
    });
    return restored;
}`;
branches = rep(branches, presentationFrom, presentationTo, 'manual lock rollback preservation');
write('v03/branches.js', branches);

// ---------------------------------------------------------------------------
// Changelog note. Runtime version remains 0.4.3; this is a corrective deep pass.
// ---------------------------------------------------------------------------
let changelog = read('CHANGELOG.md');
changelog = rep(changelog,
`## v0.4.3
`,
`## v0.4.3

- Deep-audit hardening closes cross-feature edge cases found after the phased release: long-message NPC/reference matching no longer truncates at identity-key length; gradual character development requires a genuinely different assistant message; form corrections, Key Relationship removals, and family facts are grounded against source evidence; World_State world-active authority is backend-filtered; unrelated <Blocks> wrappers stay inert while truncated recognized wrappers fail closed; life/death/resurrection changes are evidence-gated; Named preferred cannot be bypassed by a mislabeled role identity; explicitly named returning NPCs receive foreground dossier priority; fully disabling capture+continuity removes the prompt; manual name/alias collisions are rejected; deceased manual restore normalizes back to alive; and branch rollback preserves current user-locked canon plus editor-owned Importance.
`,
'changelog deep audit note');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.3 deep-audit hardening');
