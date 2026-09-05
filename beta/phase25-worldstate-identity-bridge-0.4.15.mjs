import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.15 identity-bridge marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.15 identity-bridge section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    const bridge = String.raw`function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = '') {
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
function worldStateIdentityBridgesVisibleIntroduction(patch, policy, currentAdmissionText = '') {
    if (!policy?.detected) return false;
    const canonicalName = canonicalPatchName(patch, []);
    if (!canonicalName || looksLikeRoleLabel(canonicalName, patch?.role)) return false;
    if (!containsNormalizedPhrase(policy.worldStateText || '', canonicalName)) return false;
    const visible = String(currentAdmissionText || policy.visibleText || '').trim();
    return visibleRoleIntroductionForPatch(patch, visible);
}
function newPatchAllowedByEvidence(state, patch, policy, currentAdmissionText = '') {
    if (findNpcByReference(state, patch?.name || '')) return true;
    const directlyMentioned = newPatchMentionedInCurrentExchange(patch, currentAdmissionText);
    if (!policy?.detected) return directlyMentioned;
    const scope = restrictedEvidenceScope(state, patch, policy);
    if (scope === 'inner' || scope === 'excluded') return false;
    if (scope === 'world') return worldStateIdentityBridgesVisibleIntroduction(patch, policy, currentAdmissionText);
    return directlyMentioned;
}
function newReferenceAllowedByWorldIdentityBridge(state, reference, patches, policy, currentAdmissionText = '') {
    if (!policy?.detected) return false;
    const patch = (Array.isArray(patches) ? patches : []).find(item => patchReferenceMatches(item, reference));
    if (!patch) return false;
    const patchId = String(patch?.id || '').trim();
    if (patchId && state.npcs.some(item => item.id === patchId)) return false;
    const canonicalName = canonicalPatchName(patch, [reference]);
    if (!canonicalName || findNpcByReference(state, canonicalName)) return false;
    return worldStateIdentityBridgesVisibleIntroduction(patch, policy, currentAdmissionText);
}

`;
    source = replaceSection(
        source,
        'function newPatchMentionedInCurrentExchange(patch, currentAdmissionText = \'\') {',
        'const ROLE_LABEL_MODIFIERS = new Set([',
        bridge,
        'world-state identity bridge helpers',
    );

    source = replaceRequired(
        source,
        `    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const currentAdmissionText = String(options.currentAdmissionText || '').trim();\n    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy));\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy));`,
        `    const evidencePolicy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const currentAdmissionText = String(options.currentAdmissionText || '').trim();\n    const newActivityBridge = ref => newReferenceAllowedByWorldIdentityBridge(state, ref, result.npcs, evidencePolicy, currentAdmissionText);\n    const exchangeRefs = uniqueStrings(result.exchangeActiveNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy) || newActivityBridge(ref));\n    const presentRefs = uniqueStrings(result.finalPresentNpcIds).filter(ref => referenceAllowedForActivity(state, ref, evidencePolicy) || newActivityBridge(ref));\n    const worldRefs = uniqueStrings(result.worldActiveNpcIds).filter(ref => referenceAllowedForWorldActivity(state, ref, evidencePolicy));`,
        'activity-reference bridge',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/evidence-adapter.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "        '- <World_State> may ground live location/status/off-screen world activity, but by itself NEVER proves exchange action, In chat participation, speech, direct perception, or a new NPC introduction.',",
        String.raw`        '- <World_State> may ground live location/status/off-screen world activity, but by itself NEVER proves exchange action, In chat participation, speech, direct perception, or a new NPC introduction.',
        '- IDENTITY BRIDGE: when visible narrative independently introduces one specific character by an unambiguous role/occupation and the same current <World_State> supplies that character\'s canonical proper name plus a compatible role, use the structured name for that visibly introduced character. Example: visible "the clerk" plus World_State "Kora Lind — Guild Clerk" may identify one dossier. This resolves identity only; World_State without an independent visible introduction still cannot create a dossier.',`,
        'structured evidence identity bridge rule',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.15 World_State-assisted new-NPC identity bridge');
