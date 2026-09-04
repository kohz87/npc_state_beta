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
    return {
        detected: user.detected || assistant.detected,
        visibleText: [user.visibleText, assistant.visibleText].filter(Boolean).join('\n'),
        worldStateText: [user.worldStateText, assistant.worldStateText].filter(Boolean).join('\n'),
        innerChatterText: [user.innerChatterText, assistant.innerChatterText].filter(Boolean).join('\n'),
        excludedText: [user.excludedText, assistant.excludedText].filter(Boolean).join('\n'),
        excludedTags: [...new Set([...(user.excludedTags || []), ...(assistant.excludedTags || [])])],
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
export function structuredEvidencePromptRules() {
    return [
        'STRUCTURED BLOCK EVIDENCE FIREWALL (active because a Megumin <Blocks> master block is present):',
        '- Visible narrative outside <Blocks> is ordinary full event evidence.',
        '- <World_State> may ground live location/status/off-screen world activity, but by itself NEVER proves exchange action, In chat participation, speech, direct perception, or a new NPC introduction.',
        '- <NPC_Inner_Chatter> may ground private goals, thoughts, attitudes, or relationship context, but by itself NEVER proves In chat presence, exchange action, spoken dialogue, gesture, or a visible emotional reaction.',
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
