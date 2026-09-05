import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.27 identity/presence marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    if (source.includes(replacement.trim())) return source;
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
    if (start < 0 || end < 0) throw new Error('Missing v0.4.27 identity/presence section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

// ---------------------------------------------------------------------------
// Evidence adapter: keep visible narrative primary and make World_State
// presence/off-screen corroboration section-aware.
// ---------------------------------------------------------------------------
let evidence = read('v03/evidence-adapter.js');

if (!evidence.includes('function splitWorldStatePresenceSections')) {
    evidence = replaceRequired(
        evidence,
        `const RECOGNIZED_BLOCK_TAGS = new Set([...WORLD_TAGS, ...INNER_TAGS, ...REFERENCE_TAGS]);`,
        `const RECOGNIZED_BLOCK_TAGS = new Set([...WORLD_TAGS, ...INNER_TAGS, ...REFERENCE_TAGS]);

const WORLD_STATE_OTHER_SECTION_LABELS = new Set([
    'current situation', 'continuity locks', 'unresolved threads', 'planted seeds',
    'consequence timers', 'arc phase', 'scene phase', 'time',
]);
function splitWorldStatePresenceSections(value) {
    const present = [];
    const offscreen = [];
    const other = [];
    let section = 'other';
    for (const line of String(value || '').split(/\\r?\\n/)) {
        const key = normalizePhrase(line);
        if (key === 'npcs present' || key === 'npc present') { section = 'present'; continue; }
        if (key === 'off screen' || key === 'offscreen') { section = 'offscreen'; continue; }
        if (WORLD_STATE_OTHER_SECTION_LABELS.has(key)) { section = 'other'; continue; }
        if (section === 'present') present.push(line);
        else if (section === 'offscreen') offscreen.push(line);
        else other.push(line);
    }
    return {
        presentText: clean(present.join('\\n'), 30000),
        offscreenText: clean(offscreen.join('\\n'), 30000),
        otherText: clean(other.join('\\n'), 30000),
    };
}`,
        'World_State section splitter',
    );
}

evidence = replaceRequired(
    evidence,
    `        return { detected: false, malformed: false, visibleText: source, worldStateText: '', innerChatterText: '', excludedText: '', excludedTags: [] };`,
    `        return { detected: false, malformed: false, visibleText: source, worldStateText: '', worldPresentText: '', worldOffscreenText: '', worldOtherText: '', innerChatterText: '', excludedText: '', excludedTags: [] };`,
    'unstructured evidence shape',
);

evidence = replaceRequired(
    evidence,
    `    const world = [];
    const inner = [];
    const excluded = [];`,
    `    const world = [];
    const worldPresent = [];
    const worldOffscreen = [];
    const worldOther = [];
    const inner = [];
    const excluded = [];`,
    'World_State section accumulators',
);

evidence = replaceRequired(
    evidence,
    `            if (WORLD_TAGS.has(key)) world.push(body);
            else if (INNER_TAGS.has(key)) inner.push(body);`,
    `            if (WORLD_TAGS.has(key)) {
                world.push(body);
                const sections = splitWorldStatePresenceSections(body);
                if (sections.presentText) worldPresent.push(sections.presentText);
                if (sections.offscreenText) worldOffscreen.push(sections.offscreenText);
                if (sections.otherText) worldOther.push(sections.otherText);
            }
            else if (INNER_TAGS.has(key)) inner.push(body);`,
    'World_State section extraction',
);

evidence = replaceRequired(
    evidence,
    `        worldStateText: clean(world.join('\\n')),
        innerChatterText: clean(inner.join('\\n')),`,
    `        worldStateText: clean(world.join('\\n')),
        worldPresentText: clean(worldPresent.join('\\n')),
        worldOffscreenText: clean(worldOffscreen.join('\\n')),
        worldOtherText: clean(worldOther.join('\\n')),
        innerChatterText: clean(inner.join('\\n')),`,
    'structured evidence return sections',
);

evidence = replaceRequired(
    evidence,
    `        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\\n'),`,
    `        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\\n'),
        worldPresentText: [user.worldPresentText, assistant.worldPresentText].filter(Boolean).join('\\n'),
        worldOffscreenText: [user.worldOffscreenText, assistant.worldOffscreenText].filter(Boolean).join('\\n'),
        worldOtherText: [user.worldOtherText, assistant.worldOtherText].filter(Boolean).join('\\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\\n'),`,
    'exchange evidence policy sections',
);

if (!evidence.includes('export function identityPresencePromptRules')) {
    evidence = evidence.replace(
        `export function structuredEvidencePromptRules() {`,
        `export function identityPresencePromptRules() {
    return [
        'IDENTITY AND SCENE PARTICIPATION:',
        '- Interpret identity across the WHOLE CURRENT exchange. A participating character may be referred to indirectly by pronouns, descriptions, scene continuity, or a proper name established earlier in the same exchange; the name/occupation does not need to be repeated in every sentence.',
        '- For every NEW NPC, use identityEvidence {anchor, excerpts, explanation} when identity depends on contextual binding rather than a directly repeated full canonical name. anchor must be a proper-name or unique-role identity actually present in CURRENT VISIBLE narrative. excerpts must be 1-3 exact CURRENT VISIBLE quotations. explanation briefly states the contextual binding. Do not invent missing surname/title/name components.',
        '- For every NPC claimed in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds, return an npcs patch when practical and use activityEvidence for the claimed channel. Each channel record uses 1-3 exact CURRENT VISIBLE quotations plus a concise explanation. The LLM interprets what the quotations mean; NPC State only verifies provenance and state invariants.',
        '- exchangeActive means the NPC spoke, acted, was directly acted upon, or directly perceived/received a story-relevant event somewhere in this exchange. inChat means the NPC remains individually relevant in the active scene/conversation at the END. worldActive means explicitly ongoing OFF-SCREEN activity. Judge chronology and the final scene state, not just the first mention.',
        '- inChat and worldActive are mutually exclusive final states. Never place the same NPC in both arrays. An NPC may be exchangeActive and end either inChat or worldActive after entering/leaving during the exchange.',
        '- Current visible narrative is sufficient by itself. Structured/reference blocks are optional corroboration and must never be required for ordinary identity or presence interpretation.',
    ];
}

export function structuredEvidencePromptRules() {`,
    );
}

evidence = replaceSection(
    evidence,
    `export function structuredEvidencePromptRules() {`,
    `\n\n\nconst STRUCTURED_DOSSIER_TAGS`,
    `export function structuredEvidencePromptRules() {
    return [
        'STRUCTURED BLOCK EVIDENCE FIREWALL (active because recognized Megumin-style <Blocks> content is present):',
        '- Visible narrative outside <Blocks> is ordinary full event evidence and remains the primary source for identity and scene participation.',
        '- <World_State> may corroborate live location/status and structured scene placement, but by itself NEVER proves exchange action, speech, direct perception, or a new NPC introduction.',
        '- WORLD_STATE SECTION SEMANTICS: NPCs Present and Off-Screen are separate corroboration channels. NPCs Present may corroborate identity/location but does not by itself prove inChat; Off-Screen may corroborate worldActive. A name listed only under NPCs Present must not be accepted as worldActive merely because it occurs somewhere in World_State.',
        '- IDENTITY ENRICHMENT: when CURRENT VISIBLE narrative grounds a unique short proper-name anchor and the same current World_State supplies one compatible canonical full name, the structured name may enrich that already-visible identity. The public anchor remains mandatory. World_State, NPC_Inner_Chatter, CYOA, or other reference material without a public anchor cannot manufacture a dossier or missing identity.',
        '- <NPC_Inner_Chatter> may ground private goals, thoughts, attitudes, or relationship context, but by itself NEVER proves inChat presence, exchange action, spoken dialogue, gesture, or a visible emotional reaction.',
        '- Other children of <Blocks>, including Story Tracker, Character Sheet, CYOA, Bonds, New_NPC, NPC_Update, and custom/reference blocks, are NOT current-event evidence for ordinary NPC State scanning.',
        '- Never convert private thought into visible behavior unless visible narrative independently establishes that behavior.',
    ];
}`,
    'structured evidence prompt rules',
);

write('v03/evidence-adapter.js', evidence);

// ---------------------------------------------------------------------------
// Scanner: verify public provenance, allow contextual identity binding, and
// make final in-chat/world-active state mutually exclusive.
// ---------------------------------------------------------------------------
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    `import { evidenceReferenceScope, hasRecognizedStructuredBlocks, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';`,
    `import { evidenceReferenceScope, hasRecognizedStructuredBlocks, identityPresencePromptRules, scannerEvidenceText, structuredEvidencePromptRules } from './evidence-adapter.js';`,
    'scanner identity/presence prompt import',
);

scanner = replaceRequired(
    scanner,
    `            identityKind: 'named|role-label',
            aliases: [], role: '', species: '', age:`,
    `            identityKind: 'named|role-label',
            identityEvidence: { anchor: 'proper-name or unique-role anchor from current visible narrative', excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'brief contextual identity binding' },
            activityEvidence: { exchangeActive: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC is exchange-active' }, inChat: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC remains in-chat at the end' }, worldActive: { excerpts: ['1-3 exact CURRENT VISIBLE quotations'], explanation: 'why this NPC is explicitly active off-screen' } },
            aliases: [], role: '', species: '', age:`,
    'recovery output identity/activity evidence shape',
);

scanner = replaceRequired(
    scanner,
    `        admissionPromptRule(admissionMode),`,
    `        admissionPromptRule(admissionMode),
        ...identityPresencePromptRules(),`,
    'recovery shared identity/presence guidance',
);

scanner = replaceRequired(
    scanner,
    `function referenceAllowedForActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const exactScope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    const shortScope = npc ? shortActivityIdentityScope(state, npc, policy) : '';
    // A unique short identity in public narrative can recover a full canonical identity even
    // when World_State/private/reference material contains the full name. Conversely, a short
    // identity found only inside structured material must not turn an otherwise unmentioned
    // scanner claim into public activity evidence.
    if (exactScope === 'visible' || shortScope === 'visible') return true;
    const scope = exactScope === 'unmentioned' && shortScope ? shortScope : exactScope;
    if (!['world', 'inner', 'excluded'].includes(scope)) return true;
    return npc?.present === true;
}
function referenceAllowedForWorldActivity(state, reference, policy) {
    if (!policy?.detected) return true;
    const npc = findNpcByReference(state, reference);
    const scope = evidenceReferenceScope(policy, npc ? npcEvidenceVariants(npc) : [reference]);
    return scope === 'visible' || scope === 'world';
}`,
    `function referenceAllowedForActivity(state, reference, policy, channel = 'exchangeActive', patches = [], currentAdmissionText = '') {
    const npc = findNpcByReference(state, reference);
    const patch = activityPatchForReference(state, reference, patches);
    const visible = currentVisibleEvidenceText(policy, currentAdmissionText);
    const variants = npc ? npcEvidenceVariants(npc, patch) : [reference, patch?.name, ...(Array.isArray(patch?.aliases) ? patch.aliases : [])].filter(Boolean);
    const sections = structuredReferenceSections(policy, variants);
    // A final structured Off-Screen placement contradicts inChat at the end, but it does not
    // erase exchangeActive participation that may have occurred earlier in the same exchange.
    if (channel === 'inChat' && sections.offscreen && !sections.present) return false;
    if (patch && activityEvidenceVerified(patch, channel, visible)) return true;
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
    if (patch && activityEvidenceVerified(patch, 'worldActive', visible)) return true;
    const exactVisible = variants.some(value => containsNormalizedPhrase(visible, value));
    const shortVisible = npc ? visibleShortActivityIdentityMention(state, npc, visible) : false;
    if (exactVisible || shortVisible) return true;
    return !visible && !policy?.detected;
}`,
    'source-agnostic activity provenance',
);

const identityBridgeBlock = String.raw`function identityEvidenceRecord(patch) {
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
function activityPatchForReference(state, reference, patches = []) {
    const direct = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (direct) return direct;
    const npc = findNpcByReference(state, reference);
    if (!npc) return null;
    return (Array.isArray(patches) ? patches : []).find(item => String(item?.id || '').trim() === npc.id || patchReferenceMatches(item, npc.name)) || null;
}
function structuredReferenceSections(policy, variants = []) {
    const values = [...new Set((Array.isArray(variants) ? variants : [variants]).map(value => String(value || '').trim()).filter(Boolean))];
    return {
        present: values.some(value => containsNormalizedPhrase(policy?.worldPresentText || '', value)),
        offscreen: values.some(value => containsNormalizedPhrase(policy?.worldOffscreenText || '', value)),
    };
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

`;
scanner = replaceSection(
    scanner,
    `function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = '') {`,
    `const ROLE_LABEL_MODIFIERS = new Set([`,
    identityBridgeBlock,
    'identity/activity bridge helpers',
);

scanner = replaceRequired(
    scanner,
    `    const newActivityBridge = ref => newReferenceAllowedByWorldIdentityBridge(state, ref, result.npcs, evidencePolicy, currentAdmissionText);
    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy) || newActivityBridge(ref));
    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy) || newActivityBridge(ref));
    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy));`,
    `    const newActivityBridge = (ref, channel) => newReferenceAllowedByWorldIdentityBridge(state, ref, result.npcs, evidencePolicy, currentAdmissionText, channel);
    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'exchangeActive', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'exchangeActive'));
    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy, 'inChat', result.npcs, currentAdmissionText) || newActivityBridge(ref, 'inChat'));
    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy, result.npcs, currentAdmissionText));`,
    'applyScanResult source-aware activity filtering',
);

scanner = scanner.replaceAll(
    `newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText)`,
    `newPatchAllowedByEvidence(state, patch, evidencePolicy, currentAdmissionText, result.npcs)`,
);

scanner = replaceRequired(
    scanner,
    `    const exchangeIds = resolveRefs(exchangeRefs);
    const presentIds = resolveRefs(presentRefs);
    const worldIds = resolveRefs(worldRefs);`,
    `    const exchangeIds = resolveRefs(exchangeRefs);
    const presentIds = resolveRefs(presentRefs);
    // Final presence is single-valued: a malformed proposal cannot leave the same NPC both
    // in-chat and off-screen. In-chat wins because it is the stronger current-scene claim.
    const worldIds = resolveRefs(worldRefs).filter(id => !presentIds.includes(id));`,
    'inChat/worldActive exclusivity',
);

write('v03/scanner.js', scanner);

// ---------------------------------------------------------------------------
// Foreground prompt: same shared source-agnostic instructions and transient
// evidence fields as recovery scanning.
// ---------------------------------------------------------------------------
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    `import { structuredEvidencePromptRules } from './evidence-adapter.js';`,
    `import { identityPresencePromptRules, structuredEvidencePromptRules } from './evidence-adapter.js';`,
    'foreground identity/presence prompt import',
);
injection = replaceRequired(
    injection,
    `        foregroundAdmissionRule(admissionMode),`,
    `        foregroundAdmissionRule(admissionMode),
        ...identityPresencePromptRules(),`,
    'foreground shared identity/presence guidance',
);
injection = replaceRequired(
    injection,
    `\"identityKind\":\"named|role-label\",\"aliases\":[]`,
    `\"identityKind\":\"named|role-label\",\"identityEvidence\":{\"anchor\":\"proper-name or unique-role anchor from current visible narrative\",\"excerpts\":[\"1-3 exact CURRENT VISIBLE quotations\"],\"explanation\":\"brief contextual identity binding\"},\"activityEvidence\":{\"exchangeActive\":{\"excerpts\":[\"1-3 exact CURRENT VISIBLE quotations\"],\"explanation\":\"why this NPC is exchange-active\"},\"inChat\":{\"excerpts\":[\"1-3 exact CURRENT VISIBLE quotations\"],\"explanation\":\"why this NPC remains in-chat at the end\"},\"worldActive\":{\"excerpts\":[\"1-3 exact CURRENT VISIBLE quotations\"],\"explanation\":\"why this NPC is explicitly active off-screen\"}},\"aliases\":[]`,
    'foreground identity/activity evidence shape',
);
write('v03/injection.js', injection);

console.log('Applied NPC State 0.4.27 source-agnostic identity and presence grounding');
