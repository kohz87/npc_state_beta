import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing age-semantics marker: ' + label);
    return source.replace(from, to);
}

// 1) Canonicalize actual chronological age separately from apparent age.
let schema = read('v03/schema.js');
schema = replaceRequired(
    schema,
    "export function normalizeApparentAge(value) {\n    const raw = text(value, 80);\n    if (!raw) return '';\n    // Apparent age is deliberately one approximate number, never a decade or range.\n    if (/\\b\\d{1,4}\\s*['’]?\\s*s\\b/i.test(raw)) return '';\n    const matches = [...raw.matchAll(/(^|[^\\d])(\\d{1,4})(?!\\d)/g)].map(match => Number(match[2]));\n    if (matches.length !== 1 || !Number.isInteger(matches[0]) || matches[0] < 0) return '';\n    return `~${matches[0]}`;\n}\n",
    "export function normalizeApparentAge(value) {\n    const raw = text(value, 80);\n    if (!raw) return '';\n    // Apparent age is deliberately one approximate number, never a decade or range.\n    if (/\\b\\d{1,4}\\s*['’]?\\s*s\\b/i.test(raw)) return '';\n    const matches = [...raw.matchAll(/(^|[^\\d])(\\d{1,4})(?!\\d)/g)].map(match => Number(match[2]));\n    if (matches.length !== 1 || !Number.isInteger(matches[0]) || matches[0] < 0) return '';\n    return `~${matches[0]}`;\n}\n\nexport function normalizeActualAge(value) {\n    const raw = text(value, 80);\n    if (!raw) return '';\n    // Actual age is chronological numeric data, not a life-stage label or a broad band.\n    // Preserve small-unit ages for infants/newborns, while years use the compact N/~N form.\n    if (/\\b\\d{1,4}\\s*['’]?\\s*s\\b/i.test(raw)) return '';\n    if (/\\d{1,4}\\s*(?:-|–|—|to)\\s*\\d{1,4}/i.test(raw)) return '';\n    const matches = [...raw.matchAll(/(^|[^\\d])(\\d{1,4})(?!\\d)/g)].map(match => Number(match[2]));\n    if (matches.length !== 1 || !Number.isInteger(matches[0]) || matches[0] < 0) return '';\n    const number = matches[0];\n    const approximate = /~|\\b(?:about|around|approx(?:imately)?|roughly|circa)\\b/i.test(raw);\n    const prefix = approximate ? '~' : '';\n    const lower = raw.toLocaleLowerCase();\n    const unit = /\\bdays?\\b/.test(lower) ? 'day'\n        : (/\\bweeks?\\b/.test(lower) ? 'week'\n            : (/\\bmonths?\\b/.test(lower) ? 'month' : ''));\n    if (unit) return `${prefix}${number} ${unit}${number === 1 ? '' : 's'}`;\n    return `${prefix}${number}`;\n}\n",
    'actual age normalizer',
);
schema = replaceRequired(
    schema,
    "        age: text(input.age, 80),\n        apparentAge: normalizeApparentAge(input.apparentAge),",
    "        age: normalizeActualAge(input.age),\n        apparentAge: normalizeApparentAge(input.apparentAge),",
    'normalized stored actual age',
);
write('v03/schema.js', schema);

// 2) Show the existing age to recovery/targeted scanners and make scanner application conservative.
let scanner = read('v03/scanner.js');
scanner = replaceRequired(
    scanner,
    "    normalizeApparentAge,\n    normalizeCurrentStatus,",
    "    normalizeActualAge,\n    normalizeApparentAge,\n    normalizeCurrentStatus,",
    'scanner actual-age import',
);
scanner = replaceRequired(
    scanner,
    "        role: npc.role,\n        archived: npc.archived,",
    "        role: npc.role,\n        species: npc.species,\n        age: npc.age,\n        apparentAge: npc.apparentAge,\n        archived: npc.archived,",
    'existing dossier age continuity',
);
scanner = replaceRequired(
    scanner,
    "            aliases: [], role: '', species: '', age: '', apparentAge: '~N only, e.g. ~25, or empty', appearance: '', personality: '',",
    "            aliases: [], role: '', species: '', age: 'actual chronological numeric age only: N, ~N, or N days/weeks/months; never child/adult/elderly', apparentAge: '~N only, e.g. ~25, or empty', appearance: '', personality: '',",
    'full scanner age contract',
);
scanner = replaceRequired(
    scanner,
    "        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',",
    "        '- age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; if canon explicitly gives a smaller unit, use N days, N weeks, or N months. Never write child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label in age. Never infer actual age from appearance. For an EXISTING NPC, leave age empty unless the current exchange explicitly establishes a more authoritative actual age; do not re-estimate it from prose or appearance.',\n        '- apparentAge is separate from actual age. When clearly supported, it MUST be one approximate integer written exactly as ~N, for example ~18 or ~25. Never output decade bands, prose bands, or ranges such as twenties, 20s, late twenties, 20-30, or twenties to thirties. If a single numeric apparent age is not supported, leave apparentAge empty.',",
    'full scanner age semantics',
);
scanner = replaceRequired(
    scanner,
    "        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',",
    "        'age is ACTUAL chronological age only. Use grounded numeric age data only: N or ~N years, or N days/weeks/months when explicitly established. Never use child, teenager, adult, young adult, middle-aged, elder, elderly, old, or another life-stage label. If the target already has an age and the chat does not explicitly correct it, leave age empty rather than re-estimating it.',\n        'apparentAge must be one supported numeric approximation formatted exactly as ~N. Never use decade bands, worded age bands, or ranges. Leave it empty if no single numeric apparent age is supported.',",
    'targeted refresh age semantics',
);
scanner = replaceRequired(
    scanner,
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: '', apparentAge: '~N only or empty', appearance: '', personality: '', behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`",
    "`OUTPUT CONTRACT:\\n${JSON.stringify({ exchangeActiveNpcIds: [], inChatNpcIds: [], worldActiveNpcIds: [], npcs: [{ id: npc.id, name: npc.name, aliases: [], role: '', species: '', age: 'actual chronological numeric age only or empty', apparentAge: '~N only or empty', appearance: '', personality: '', behaviorProfile: null, speech: '', mannerisms: null, background: '', keyRelationships: null, memories: null, relationshipSummary: 'NPC relationship with PLAYER only', mood: '', location: '', goal: '', status: 'concrete current activity, situation, or condition; never lifecycle presence', importance: 0, lifeState: 'alive|dead|unknown', lifeStateCertainty: '', lifeStateReason: '', livingReturn: false, relationshipChange: { impact: 'none', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' } }], socialEdges: [] })}`",
    'targeted refresh age contract',
);
scanner = replaceRequired(
    scanner,
    "        const value = field === 'name'\n            ? canonicalName\n            : (field === 'apparentAge' ? normalizeApparentAge(patch?.[field]) : String(patch?.[field] ?? '').trim());\n        if (!value) continue;\n        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);\n        next[field] = value;",
    "        const value = field === 'name'\n            ? canonicalName\n            : (field === 'age'\n                ? normalizeActualAge(patch?.[field])\n                : (field === 'apparentAge' ? normalizeApparentAge(patch?.[field]) : String(patch?.[field] ?? '').trim()));\n        if (!value) continue;\n        if (field === 'age') {\n            const current = normalizeActualAge(next.age);\n            if (current && current !== value) {\n                // Scanner age is sticky once grounded. Only refine ~N to the same exact N.\n                // Genuine later corrections/aging remain available through manual dossier edit.\n                const exactRefinement = current.startsWith('~') && !value.startsWith('~') && current.slice(1) === value;\n                if (!exactRefinement) continue;\n            }\n        }\n        if (field === 'name' && value !== next.name && next.name && !isTechnicalNpcIdentity(next.name)) next.aliases = appendUnique(next.aliases, [next.name], 10);\n        next[field] = value;",
    'sticky scanner actual age',
);
write('v03/scanner.js', scanner);

// 3) Foreground contract uses the same semantics and exposes existing age as actual age.
let injection = read('v03/injection.js');
injection = replaceRequired(
    injection,
    "field('Species', npc.species), field('Age', npc.age), field('Apparent age', npc.apparentAge),",
    "field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),",
    'foreground continuity age labels',
);
injection = replaceRequired(
    injection,
    "        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',",
    "        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',\n        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC, leave age empty unless this response explicitly establishes a more authoritative actual age; do not re-estimate it each turn. apparentAge is the separate visual estimate and uses ~N only.',",
    'foreground age semantics',
);
injection = replaceRequired(
    injection,
    "\"age\":\"\",\"apparentAge\":\"~N or empty\"",
    "\"age\":\"actual chronological numeric age only or empty\",\"apparentAge\":\"~N or empty\"",
    'foreground age contract',
);
write('v03/injection.js', injection);

// 4) Make the dossier wording reinforce the distinction.
let dossierView = read('v03/dossier-view.js');
dossierView = replaceRequired(
    dossierView,
    "        npc.age ? `Age ${npc.age}` : '',",
    "        npc.age ? `Actual age ${npc.age}` : '',",
    'dossier actual age label',
);
write('v03/dossier-view.js', dossierView);

let changelog = read('CHANGELOG.md');
const line = '- Age semantics hardening: actual age is now numeric chronological data only, existing numeric ages are scanner-sticky instead of being re-estimated, recovery/Refresh prompts receive the stored age, and life-stage labels such as child/adult/elderly are rejected from age fields.';
if (!changelog.includes(line)) changelog = replaceRequired(changelog, '## v0.4.1\n\n', '## v0.4.1\n\n' + line + '\n', 'changelog heading');
write('CHANGELOG.md', changelog);

console.log('Applied NPC State 0.4.1 age semantics hardening');
