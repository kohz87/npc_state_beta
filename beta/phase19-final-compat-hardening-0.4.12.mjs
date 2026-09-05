import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.12 final marker: ' + label);
    return source.replace(from, to);
}

// Existing stored-identity collisions retain the established fail-closed patch skip.
// Only a name/alias newly reserved by another patch in this same observation aborts the payload.
{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `function preflightAutomaticIdentityPatches(state, patches = [], referenceCandidates = []) {\n    const owners = new Map();\n    for (const npc of state?.npcs || []) {\n        for (const value of [npc?.name, ...(npc?.aliases || [])]) {\n            const key = normalizeName(value);\n            if (key) owners.set(key, npc.id);\n        }\n    }`,
        `function preflightAutomaticIdentityPatches(state, patches = [], referenceCandidates = []) {\n    const owners = new Map();\n    const initialIdentityKeys = new Set();\n    for (const npc of state?.npcs || []) {\n        for (const value of [npc?.name, ...(npc?.aliases || [])]) {\n            const key = normalizeName(value);\n            if (key) { owners.set(key, npc.id); initialIdentityKeys.add(key); }\n        }\n    }`,
        'initial identity reservation set',
    );
    source = replaceRequired(
        source,
        `            if (owner && owner !== prospectiveOwner) {\n                throw new Error('NPC State v0.4.12 scanner identity collision inside one observation: ' + value + '.');\n            }`,
        `            if (owner && owner !== prospectiveOwner) {\n                // A collision with canon that already existed before this observation is\n                // handled by automaticIdentityPatchConflicts() as a local patch rejection.\n                // A newly claimed key is a same-observation conflict and invalidates the payload.\n                if (!initialIdentityKeys.has(key)) {\n                    throw new Error('NPC State v0.4.12 scanner identity collision inside one observation: ' + value + '.');\n                }\n            }`,
        'same-scan-only collision throw',
    );
    source = replaceRequired(
        source,
        `        for (const value of values) {\n            const key = normalizeName(value);\n            if (key) owners.set(key, prospectiveOwner);\n        }`,
        `        for (const value of values) {\n            const key = normalizeName(value);\n            if (key && (!initialIdentityKeys.has(key) || owners.get(key) === prospectiveOwner)) owners.set(key, prospectiveOwner);\n        }`,
        'do not steal pre-existing identity reservation',
    );
    fs.writeFileSync(path, source);
}

// "less trusting/loving/tense" is a local polarity inversion just like "not trusting".
{
    const path = 'v03/relationship-evidence.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        `const NEGATION = new Set(['not', 'no', 'never', 'neither', 'refuse', 'refuses', 'refused', 'deny', 'denies', 'denied']);`,
        `const NEGATION = new Set(['not', 'no', 'never', 'neither', 'less', 'refuse', 'refuses', 'refused', 'deny', 'denies', 'denied']);`,
        'comparative polarity inversion',
    );
    fs.writeFileSync(path, source);
}

// Keep the v0.4.11 regression meaningful under the renamed v0.4.12 validation error.
{
    const path = 'beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs';
    let source = fs.readFileSync(path, 'utf8');
    source = source.replace(/\/missing required payload structure\/i/g, '/(?:missing required payload structure|invalid payload structure or members)/i');
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.12 final compatibility hardening');
