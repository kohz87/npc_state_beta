function clean(value, max = 50000) {
    return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
}
function normalizeTag(value) {
    return String(value || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}
function normalizePhrase(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();
}
const WORLD_TAGS = new Set(['worldstate']);
const INNER_TAGS = new Set(['npcinnerchatter']);
const REFERENCE_TAGS = new Set(['storytracker', 'charactersheet', 'cyoa', 'bonds', 'newnpc', 'npcupdate']);
const RECOGNIZED_BLOCK_TAGS = new Set([...WORLD_TAGS, ...INNER_TAGS, ...REFERENCE_TAGS]);

const WORLD_STATE_OTHER_SECTION_LABELS = new Set([
    'current situation', 'continuity locks', 'unresolved threads', 'planted seeds',
    'consequence timers', 'arc phase', 'scene phase', 'time',
]);
function splitWorldStatePresenceSections(value) {
    const present = [];
    const offscreen = [];
    const other = [];
    let section = 'other';
    for (const line of String(value || '').split(/\r?\n/)) {
        const key = normalizePhrase(line);
        if (key === 'npcs present' || key === 'npc present') { section = 'present'; continue; }
        if (key === 'off screen' || key === 'offscreen') { section = 'offscreen'; continue; }
        if (WORLD_STATE_OTHER_SECTION_LABELS.has(key)) { section = 'other'; continue; }
        if (section === 'present') present.push(line);
        else if (section === 'offscreen') offscreen.push(line);
        else other.push(line);
    }
    return {
        presentText: clean(present.join('\n'), 30000),
        offscreenText: clean(offscreen.join('\n'), 30000),
        otherText: clean(other.join('\n'), 30000),
    };
}

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
        return { detected: false, malformed: false, visibleText: source, worldStateText: '', worldPresentText: '', worldOffscreenText: '', worldOtherText: '', innerChatterText: '', excludedText: '', excludedTags: [] };
    }

    let visibleText = source;
    const world = [];
    const worldPresent = [];
    const worldOffscreen = [];
    const worldOther = [];
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
            if (WORLD_TAGS.has(key)) {
                world.push(body);
                const sections = splitWorldStatePresenceSections(body);
                if (sections.presentText) worldPresent.push(sections.presentText);
                if (sections.offscreenText) worldOffscreen.push(sections.offscreenText);
                if (sections.otherText) worldOther.push(sections.otherText);
            }
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
        worldPresentText: clean(worldPresent.join('\n')),
        worldOffscreenText: clean(worldOffscreen.join('\n')),
        worldOtherText: clean(worldOther.join('\n')),
        innerChatterText: clean(inner.join('\n')),
        excludedText: clean(excluded.join('\n')),
        excludedTags: excludedTags.slice(0, 40),
    };
}
export function hasRecognizedStructuredBlocks(value) {
    return analyzeStructuredEvidence(value).detected;
}
export function scannerEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    if (!view.detected) return String(value ?? '');
    const parts = [];
    if (view.visibleText) parts.push('[VISIBLE NARRATIVE | full event evidence]\n' + view.visibleText);
    if (view.worldStateText) parts.push('[MEGUMIN World_State | live location/status/off-screen context only; NOT proof of in-chat presence, exchange action, or new-NPC introduction]\n' + view.worldStateText);
    if (view.innerChatterText) parts.push('[MEGUMIN NPC_Inner_Chatter | private goals/thoughts/attitudes/relationship context only; NOT proof of in-chat presence, exchange action, speech, gesture, or visible reaction]\n' + view.innerChatterText);
    if (view.excludedTags.length) parts.push('[MEGUMIN reference/control blocks excluded from ordinary event evidence: ' + view.excludedTags.join(', ') + ']');
    return parts.join('\n\n');
}
export function relationshipEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? [view.visibleText, view.innerChatterText].filter(Boolean).join('\n') : String(value ?? '');
}
export function profileEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? view.visibleText : String(value ?? '');
}
export function retentionEvidenceText(value) {
    const view = analyzeStructuredEvidence(value);
    return view.detected ? [view.visibleText, view.worldStateText, view.innerChatterText].filter(Boolean).join('\n') : String(value ?? '');
}
export function buildExchangeEvidencePolicy(exchange) {
    const user = analyzeStructuredEvidence(exchange?.user?.mes || '');
    const assistant = analyzeStructuredEvidence(exchange?.assistant?.mes || '');
    const relationshipSources = [
        { id: 'user-visible', kind: 'visible', text: clean(user.visibleText, 30000) },
        { id: 'user-inner', kind: 'inner', text: clean(user.innerChatterText, 30000) },
        { id: 'assistant-visible', kind: 'visible', text: clean(assistant.visibleText, 30000) },
        { id: 'assistant-inner', kind: 'inner', text: clean(assistant.innerChatterText, 30000) },
    ].filter(source => source.text);
    return {
        detected: user.detected || assistant.detected,
        visibleText: [user.visibleText, assistant.visibleText].filter(Boolean).join('\n'),
        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\n'),
        worldPresentText: [user.worldPresentText, assistant.worldPresentText].filter(Boolean).join('\n'),
        worldOffscreenText: [user.worldOffscreenText, assistant.worldOffscreenText].filter(Boolean).join('\n'),
        worldOtherText: [user.worldOtherText, assistant.worldOtherText].filter(Boolean).join('\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\n'),
        excludedText: [user.excludedText, assistant.excludedText].filter(Boolean).join('\n'),
        excludedTags: [...new Set([...(user.excludedTags || []), ...(assistant.excludedTags || [])])],
        relationshipSources,
    };
}

function containsReference(text, variants) {
    const haystack = ' ' + normalizePhrase(text) + ' ';
    return (Array.isArray(variants) ? variants : [variants]).some(value => {
        const needle = normalizePhrase(value);
        return Boolean(needle && haystack.includes(' ' + needle + ' '));
    });
}
export function evidenceReferenceScope(policy, variants) {
    if (!policy?.detected) return 'unrestricted';
    if (containsReference(policy.visibleText, variants)) return 'visible';
    if (containsReference(policy.worldStateText, variants)) return 'world';
    if (containsReference(policy.innerChatterText, variants)) return 'inner';
    if (containsReference(policy.excludedText, variants)) return 'excluded';
    return 'unmentioned';
}
export function identityPresencePromptRules() {
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

export function structuredEvidencePromptRules() {
    return [
        'STRUCTURED BLOCK EVIDENCE FIREWALL (active because recognized Megumin-style <Blocks> content is present):',
        '- Visible narrative outside <Blocks> is ordinary full event evidence and remains the primary source for identity and scene participation.',
        '- <World_State> may corroborate live location/status and structured scene placement, but by itself NEVER proves exchange action, speech, direct perception, or a new NPC introduction.',
        '- WORLD_STATE SECTION SEMANTICS: NPCs Present and Off-Screen are separate corroboration channels. NPCs Present may corroborate identity/location but does not by itself prove inChat; Off-Screen may corroborate worldActive. A name listed only under NPCs Present must not be accepted as worldActive merely because it occurs somewhere in World_State.',
        '- IDENTITY BRIDGE: public identity enrichment remains optional corroboration. when CURRENT VISIBLE narrative grounds a unique short proper-name anchor and the same current World_State supplies one compatible canonical full name, the structured name may enrich that already-visible identity. The public anchor remains mandatory. World_State, NPC_Inner_Chatter, CYOA, or other reference material without a public anchor cannot manufacture a dossier or missing identity. World_State without an independent visible introduction still cannot create a dossier.',
        '- <NPC_Inner_Chatter> may ground private goals, thoughts, attitudes, or relationship context, but by itself NEVER proves inChat presence, exchange action, spoken dialogue, gesture, or a visible emotional reaction.',
        '- Other children of <Blocks>, including Story Tracker, Character Sheet, CYOA, Bonds, New_NPC, NPC_Update, and custom/reference blocks, are NOT current-event evidence for ordinary NPC State scanning.',
        '- Never convert private thought into visible behavior unless visible narrative independently establishes that behavior.',
    ];
}


const STRUCTURED_DOSSIER_TAGS = new Map([
    ['newnpc', 'New_NPC'],
    ['npcupdate', 'NPC_Update'],
]);

export function extractStructuredDossierBlocks(value) {
    const source = String(value ?? '');
    const out = [];
    const masterPattern = /<Blocks\b[^>]*>([\s\S]*?)<\/Blocks\s*>/gi;
    let master;
    while ((master = masterPattern.exec(source))) {
        const childPattern = /<([A-Za-z][A-Za-z0-9_-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g;
        let child;
        while ((child = childPattern.exec(master[1] || ''))) {
            const tag = STRUCTURED_DOSSIER_TAGS.get(normalizeTag(child[1]));
            const body = clean(child[2], 30000);
            if (tag && body) out.push({ tag, body });
        }
    }
    return out.slice(0, 80);
}

export function structuredDossierBlocksForNpc(chat = [], npc = {}, depth = 30) {
    // Deliberate structured import must identify the dossier by canonical name/alias.
    // Generic occupations such as Guard or Clerk are not identity evidence and could pull
    // another NPC's structured block into the selected dossier.
    const variants = [...new Set([npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]
        .map(value => String(value || '').trim()).filter(Boolean))];
    if (!variants.length) return [];
    const rows = [];
    const source = Array.isArray(chat) ? chat : [];
    const start = Math.max(0, source.length - Math.max(2, Math.min(80, Math.round(Number(depth) || 30))));
    for (let messageId = start; messageId < source.length; messageId += 1) {
        const message = source[messageId];
        if (!message || message.is_system) continue;
        for (const block of extractStructuredDossierBlocks(message.mes)) {
            if (!containsReference(block.body, variants)) continue;
            rows.push({ messageId, role: message.is_user ? 'USER' : 'ASSISTANT', tag: block.tag, body: block.body });
        }
    }
    return rows.slice(-24);
}
