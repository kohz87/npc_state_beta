import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing Phase 3 marker: ' + label);
    return source.replace(from, to);
}

let schema = fs.readFileSync('v03/schema.js', 'utf8');
schema = replaceRequired(
    schema,
`function list(value, max = 12, itemMax = 500) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const clean = collectionEntry(item, itemMax);
        const key = clean.toLocaleLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}
`,
`function list(value, max = 12, itemMax = 500) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    const seen = new Set();
    for (const item of input) {
        const clean = collectionEntry(item, itemMax);
        const key = clean.toLocaleLowerCase();
        if (!clean || seen.has(key)) continue;
        seen.add(key);
        out.push(clean);
        if (out.length >= max) break;
    }
    return out;
}

const MEMORY_STOP_WORDS = new Set([
    'the','a','an','and','or','but','to','of','in','on','at','for','from','with','without','into','onto','by','as','is','was','were','be','been','being',
    'he','she','they','them','his','her','their','this','that','these','those','when','while','after','before','during','then','later','still','very','really',
    'npc','player','remember','remembers','remembered','memory','that','who','which','what','where','how','it','its',
]);
const MEMORY_EVENT_GROUPS = Object.freeze([
    ['rescue', /\\b(rescue(?:d|s|ing)?|sav(?:e|ed|es|ing)|protect(?:ed|s|ing)? from)\\b/i],
    ['promise', /\\b(promis(?:e|ed|es|ing)|vow(?:ed|s|ing)?|swore|sworn)\\b/i],
    ['betray', /\\b(betray(?:ed|s|ing|al)?|backstab(?:bed|s|bing)?)\\b/i],
    ['wound', /\\b(wound(?:ed|s|ing)?|injur(?:e|ed|es|ing)|hurt)\\b/i],
    ['discover', /\\b(discover(?:ed|s|ing|y)?|found|finds?|uncover(?:ed|s|ing)?)\\b/i],
    ['reveal', /\\b(reveal(?:ed|s|ing)?|confess(?:ed|es|ing)?|admit(?:ted|s|ting)?)\\b/i],
    ['teach', /\\b(teach(?:es|ing)?|taught|train(?:ed|s|ing)?)\\b/i],
    ['fight', /\\b(fight(?:s|ing)?|fought|battle(?:d|s|ing)?|combat)\\b/i],
    ['heal', /\\b(heal(?:ed|s|ing)?|treat(?:ed|s|ing)?|cure(?:d|s|ing)?)\\b/i],
    ['kill', /\\b(kill(?:ed|s|ing)?|slay(?:s|ing)?|slew|slain)\\b/i],
    ['death', /\\b(die(?:d|s|ing)?|dead|death|passed away)\\b/i],
    ['give', /\\b(give(?:s|n|ing)?|gave|gift(?:ed|s|ing)?)\\b/i],
    ['return', /\\b(return(?:ed|s|ing)?|gave back|brought back)\\b/i],
    ['marry', /\\b(marry|married|marries|marriage|wed(?:ded|s|ding)?)\\b/i],
    ['separate', /\\b(leave|left|depart(?:ed|s|ing)?|separat(?:e|ed|es|ing)|estrang(?:ed|ement))\\b/i],
]);

function memorySemanticText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\\p{P}\\p{S}]+/gu, ' ')
        .replace(/\\s+/g, ' ')
        .trim()
        .slice(0, 1200);
}

function memorySemanticParts(value) {
    const text = memorySemanticText(value);
    const tokens = text.split(/\\s+/).filter(token => token.length >= 2 && !MEMORY_STOP_WORDS.has(token));
    const tokenSet = new Set(tokens);
    const events = new Set(MEMORY_EVENT_GROUPS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name));
    return { text, tokens, tokenSet, events };
}

function memoryIntersectionSize(left, right) {
    let count = 0;
    for (const token of left) if (right.has(token)) count += 1;
    return count;
}

export function memoriesSemanticallyDuplicate(a, b) {
    const left = memorySemanticParts(a);
    const right = memorySemanticParts(b);
    if (!left.text || !right.text) return false;
    if (left.text === right.text) return true;
    if (Math.min(left.text.length, right.text.length) >= 28 && (left.text.includes(right.text) || right.text.includes(left.text))) return true;
    const shared = memoryIntersectionSize(left.tokenSet, right.tokenSet);
    const union = new Set([...left.tokenSet, ...right.tokenSet]).size || 1;
    const jaccard = shared / union;
    const sharedEvent = [...left.events].some(event => right.events.has(event));
    const eventTokens = new Set([...left.events, ...right.events]);
    const sharedAnchors = [...left.tokenSet].filter(token => right.tokenSet.has(token) && !eventTokens.has(token)).length;
    if (sharedEvent && sharedAnchors >= 2 && jaccard >= 0.38) return true;
    return shared >= 4 && jaccard >= 0.70;
}

function memoryInformationScore(value) {
    const parts = memorySemanticParts(value);
    return parts.tokenSet.size * 8 + parts.events.size * 4 + Math.min(120, parts.text.length) / 20;
}

export function normalizeMemoryEntries(value, max = MEMORY_LIMIT, itemMax = 700) {
    const input = Array.isArray(value) ? value : (value == null ? [] : [value]);
    const out = [];
    for (const raw of input) {
        const clean = collectionEntry(raw, itemMax);
        if (!clean) continue;
        const duplicateIndex = out.findIndex(existing => memoriesSemanticallyDuplicate(existing, clean));
        if (duplicateIndex >= 0) {
            // Keep the richer of two paraphrases rather than spending two memory slots on
            // the same event. Equal-information ties preserve the earlier established wording.
            if (memoryInformationScore(clean) > memoryInformationScore(out[duplicateIndex]) + 1) out[duplicateIndex] = clean;
            continue;
        }
        out.push(clean);
        if (out.length >= max) break;
    }
    return out.slice(0, max);
}
`,
    'semantic memory helpers',
);
schema = replaceRequired(
    schema,
`        memories: list(input.memories, DOSSIER_LIMIT_MAXIMUMS.memories, 700),
`,
`        memories: normalizeMemoryEntries(input.memories, DOSSIER_LIMIT_MAXIMUMS.memories, 700),
`,
    'dossier memory normalization',
);
fs.writeFileSync('v03/schema.js', schema);

let scanner = fs.readFileSync('v03/scanner.js', 'utf8');
scanner = replaceRequired(
    scanner,
`    normalizeKeyRelationshipEntries,
    normalizeName,
`,
`    normalizeKeyRelationshipEntries,
    normalizeMemoryEntries,
    normalizeName,
`,
    'scanner memory import',
);
scanner = replaceRequired(
    scanner,
`    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = appendUnique([], patch.memories, limits.memories);
    }
`,
`    if (Array.isArray(patch?.memories)) {
        const limits = normalizeDossierLimits(options.dossierLimits);
        next.memories = normalizeMemoryEntries(patch.memories, limits.memories, 700);
    }
`,
    'scanner memory compaction',
);
scanner = replaceRequired(
    scanner,
`        '- Keep individual collection entries concise, grounded, and independently useful later.',
`,
`        '- Keep individual collection entries concise, grounded, and independently useful later.',
        '- MEMORY SEMANTIC HYGIENE: Important Memories represent distinct durable events/facts, not paraphrase logs. If two candidate memories describe the same event with the same participants/outcome, return one concise richest version. Do not merge merely because the same people or topic recur: rescue and later training, two different promises, or separate injuries remain separate memories.',
`,
    'memory prompt hygiene',
);
fs.writeFileSync('v03/scanner.js', scanner);

let injection = fs.readFileSync('v03/injection.js', 'utf8');
injection = replaceRequired(
    injection,
`        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\\n' + String(settings.memoryCriteria).slice(0, 6000) : '',
`,
`        'MEMORY SEMANTIC HYGIENE: Important Memories are distinct durable events/facts, never a running paraphrase log. Collapse multiple phrasings of the same event/participants/outcome into one concise richest entry, but keep genuinely separate events even when they involve the same people or topic.',
        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\\n' + String(settings.memoryCriteria).slice(0, 6000) : '',
`,
    'foreground memory hygiene rule',
);
fs.writeFileSync('v03/injection.js', injection);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 3 adds deterministic semantic hygiene for Important Memories. Near-duplicate paraphrases of the same grounded event collapse to one richer concise entry during normalization and scan application, while separate events involving the same people/topic remain distinct. This is local token/event-concept matching only, with no embeddings or extra model calls.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 3 semantic memory hygiene');
