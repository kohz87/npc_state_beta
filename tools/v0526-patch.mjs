import fs from 'node:fs';

function read(path) {
    return fs.readFileSync(path, 'utf8');
}
function write(path, content) {
    fs.writeFileSync(path, content, 'utf8');
}
function replaceOnce(path, from, to) {
    const source = read(path);
    if (!source.includes(from)) throw new Error(`${path}: expected source fragment not found`);
    if (source.indexOf(from) !== source.lastIndexOf(from)) throw new Error(`${path}: source fragment is not unique`);
    write(path, source.replace(from, to));
}
function replaceRegexOnce(path, pattern, replacement) {
    const source = read(path);
    const matches = source.match(pattern);
    if (!matches) throw new Error(`${path}: expected pattern not found: ${pattern}`);
    write(path, source.replace(pattern, replacement));
}

replaceOnce('src/evidence-adapter.js', `    const relationshipSources = [
        { id: 'user-visible', kind: 'visible', text: clean(user.visibleText, 30000) },
        { id: 'user-inner', kind: 'inner', text: clean(user.innerChatterText, 30000) },
        { id: 'assistant-visible', kind: 'visible', text: clean(assistant.visibleText, 30000) },
        { id: 'assistant-inner', kind: 'inner', text: clean(assistant.innerChatterText, 30000) },
    ].filter(source => source.text);`, `    const relationshipSources = [
        { id: 'user-visible', kind: 'visible', role: 'user', text: clean(user.visibleText, 30000) },
        { id: 'user-inner', kind: 'inner', role: 'user', text: clean(user.innerChatterText, 30000) },
        { id: 'assistant-visible', kind: 'visible', role: 'assistant', text: clean(assistant.visibleText, 30000) },
        { id: 'assistant-inner', kind: 'inner', role: 'assistant', text: clean(assistant.innerChatterText, 30000) },
    ].filter(source => source.text);`);

replaceOnce('src/relationship-evidence.js', `        return {
            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),
            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',
            insideQuotedDialogue: quotedSliceMatch || excerptInsideQuotedDialogue(excerpt, sourceText),
        };`, `        return {
            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),
            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',
            sourceRole: ['user', 'assistant'].includes(String(raw.role || '').trim()) ? String(raw.role).trim() : '',
            insideQuotedDialogue: quotedSliceMatch || excerptInsideQuotedDialogue(excerpt, sourceText),
        };`);

replaceOnce('src/scan-relationships.js', `function playerMentioned(excerpt, playerName, npcNames = [], { allowNarratorSecondPerson = true } = {}) {
    if (containsNormalizedPhrase(excerpt, playerName) && !identityShortTokenAmbiguous(playerName, npcNames)) return true;
    const short = shortActivityIdentityCandidates({ name: playerName, aliases: [] });
    if (short.some(candidate => containsNormalizedPhrase(excerpt, candidate) && !identityShortTokenAmbiguous(candidate, npcNames))) return true;
    return allowNarratorSecondPerson && /\\b(?:you|your|yours|yourself)\\b/i.test(narrationOutsideQuotedDialogue(excerpt));
}`, `function playerMentioned(excerpt, playerName, npcNames = [], { allowNarratorSecondPerson = true, sourceRole = '' } = {}) {
    if (containsNormalizedPhrase(excerpt, playerName) && !identityShortTokenAmbiguous(playerName, npcNames)) return true;
    const short = shortActivityIdentityCandidates({ name: playerName, aliases: [] });
    if (short.some(candidate => containsNormalizedPhrase(excerpt, candidate) && !identityShortTokenAmbiguous(candidate, npcNames))) return true;
    const narration = narrationOutsideQuotedDialogue(excerpt);
    // POV-sensitive pronouns are only direct authority when the message role makes their
    // referent structural rather than guessed: USER first person is the PC, while ASSISTANT
    // narrator second person addresses the PC. Dialogue pronouns stay non-authoritative here.
    if (sourceRole === 'user' && /\\b(?:i|me|my|mine|myself)\\b/i.test(narration)) return true;
    const secondPersonAllowed = allowNarratorSecondPerson && sourceRole !== 'user';
    return secondPersonAllowed && /\\b(?:you|your|yours|yourself)\\b/i.test(narration);
}`);

replaceOnce('src/scan-relationships.js', `function explicitOtherNpcTarget(excerpt, subjectNames, playerName, otherNpcNames, match) {
    if (!identityMentioned(excerpt, otherNpcNames, subjectNames)) return false;
    return !playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames], {
        allowNarratorSecondPerson: match?.insideQuotedDialogue !== true,
    });
}`, `function explicitOtherNpcTarget(excerpt, subjectNames, playerName, otherNpcNames, match) {
    if (!identityMentioned(excerpt, otherNpcNames, subjectNames)) return false;
    return !playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames], {
        allowNarratorSecondPerson: match?.insideQuotedDialogue !== true,
        sourceRole: match?.sourceRole || '',
    });
}`);

replaceOnce('src/scan-relationships.js', `function contextualDialogueNarrationAmbiguous(excerpt, subjectNames, playerName, otherNpcNames, acceptedActivityExcerpts, acceptedIdentityExcerpts) {
    const value = String(excerpt || '').trim();
    if (!/[\"“”‘’]/u.test(value)) return false;
    const narration = narrationOutsideQuotedDialogue(value)
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
    if (!narration) return false;
    if (summaryExcerptOverlapsAcceptedActivity(value, acceptedActivityExcerpts)
        || summaryExcerptOverlapsAcceptedActivity(value, acceptedIdentityExcerpts)) return false;
    return !playerMentioned(narration, playerName, [...subjectNames, ...otherNpcNames], { allowNarratorSecondPerson: true });
}`, `function contextualDialogueNarrationAmbiguous(excerpt, subjectNames, playerName, otherNpcNames, acceptedActivityExcerpts, acceptedIdentityExcerpts, sourceRole = '') {
    const value = String(excerpt || '').trim();
    if (!/[\"“”‘’]/u.test(value)) return false;
    const narration = narrationOutsideQuotedDialogue(value)
        .replace(/<[^>]*>/gu, ' ')
        .replace(/\\s+/g, ' ')
        .trim();
    if (!narration) return false;
    if (summaryExcerptOverlapsAcceptedActivity(value, acceptedActivityExcerpts)
        || summaryExcerptOverlapsAcceptedActivity(value, acceptedIdentityExcerpts)) return false;
    return !playerMentioned(narration, playerName, [...subjectNames, ...otherNpcNames], {
        allowNarratorSecondPerson: true,
        sourceRole,
    });
}`);

replaceOnce('src/scan-relationships.js', `            && playerMentioned(visibleNarration, playerName, [...subjectNames, ...otherNpcNames], { allowNarratorSecondPerson: true })
            && summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)) {`, `            && playerMentioned(visibleNarration, playerName, [...subjectNames, ...otherNpcNames], {
                allowNarratorSecondPerson: true,
                sourceRole: excerptMatches[index]?.sourceRole || '',
            })
            && summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)) {`);

replaceOnce('src/scan-relationships.js', `    const playerActivitySources = new Set(activityBindings.filter(row => row.kind === 'visible'
        && !identityMentioned(row.excerpt, otherNpcNames, subjectNames)
        && playerMentioned(narrationOutsideQuotedDialogue(row.excerpt), playerName, [...subjectNames, ...otherNpcNames], { allowNarratorSecondPerson: true }))
        .map(row => row.sourceId));
    const identityActivitySources = new Set([...activityBindings, ...identityBindings]
        .filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames))
        .map(row => row.sourceId));
    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));
    if (!bridgedSources.size) return false;

    const linkedSummarySources = new Set(identityIndexes
        .map(index => excerptMatches[index]?.sourceId)
        .filter(sourceId => sourceId && bridgedSources.has(sourceId)));
    if (!linkedSummarySources.size) return false;

    // Contextual reuse is deliberately one-source. Additional summary quotes may enrich the
    // model's description, but they may not switch visibility/message records or explicitly
    // target another known NPC and borrow this player's accepted interaction.
    return [...linkedSummarySources].some(sourceId => excerpts.every((excerpt, index) =>
        excerptMatches[index]?.sourceId === sourceId
        && !explicitOtherNpcTarget(excerpt, subjectNames, playerName, otherNpcNames, excerptMatches[index])
        && !contextualDialogueNarrationAmbiguous(
            excerpt,
            subjectNames,
            playerName,
            otherNpcNames,
            acceptedActivityExcerpts,
            acceptedIdentityExcerpts,
        )));`, `    const playerActivitySources = new Set(activityBindings.filter(row => row.kind === 'visible'
        && !identityMentioned(row.excerpt, otherNpcNames, subjectNames)
        && playerMentioned(row.excerpt, playerName, [...subjectNames, ...otherNpcNames], {
            allowNarratorSecondPerson: row.insideQuotedDialogue !== true,
            sourceRole: row.sourceRole || '',
        }))
        .map(row => row.sourceId));
    const identityActivitySources = new Set([...activityBindings, ...identityBindings]
        .filter(row => identityMentioned(row.excerpt, subjectNames, otherNpcNames))
        .map(row => row.sourceId));
    const bridgedSources = new Set([...playerActivitySources].filter(sourceId => identityActivitySources.has(sourceId)));
    const summarySourceSafe = sourceId => excerpts.every((excerpt, index) =>
        excerptMatches[index]?.sourceId === sourceId
        && !explicitOtherNpcTarget(excerpt, subjectNames, playerName, otherNpcNames, excerptMatches[index])
        && !contextualDialogueNarrationAmbiguous(
            excerpt,
            subjectNames,
            playerName,
            otherNpcNames,
            acceptedActivityExcerpts,
            acceptedIdentityExcerpts,
            excerptMatches[index]?.sourceRole || '',
        ));

    const linkedSummarySources = new Set(identityIndexes
        .map(index => excerptMatches[index]?.sourceId)
        .filter(sourceId => sourceId && bridgedSources.has(sourceId)));
    if ([...linkedSummarySources].some(summarySourceSafe)) return true;

    // POV-independent fallback: accepted exchangeActive + exact activityEvidence is the
    // model's semantic participant binding for this operation. It may supply the PC side
    // when first/second/third-person wording or dialogue does not expose a deterministic
    // pronoun anchor, but only for summary excerpts that reuse this NPC's own accepted
    // activity/identity evidence in one visible permitted source. Unowned same-scene quotes
    // and explicit other-NPC targets still fail closed. Numeric relationship scoring does
    // not use this descriptive-summary bridge.
    const exchangeActivitySources = new Set(activityBindings
        .filter(row => row.kind === 'visible')
        .map(row => row.sourceId));
    const povBoundSummarySources = new Set(identityIndexes
        .map(index => excerptMatches[index]?.sourceId)
        .filter(sourceId => sourceId && exchangeActivitySources.has(sourceId)));
    return [...povBoundSummarySources].some(sourceId => summarySourceSafe(sourceId)
        && excerpts.every(excerpt => summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)
            || summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedIdentityExcerpts)));`);

replaceOnce('src/scan-relationships.js', `    const directlyTargetBound = excerpts.some((excerpt, index) => identityMentioned(excerpt, subjectNames, otherNpcNames)
        && playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames], { allowNarratorSecondPerson: excerptMatches[index]?.insideQuotedDialogue !== true }));`, `    const directlyTargetBound = excerpts.some((excerpt, index) => identityMentioned(excerpt, subjectNames, otherNpcNames)
        && playerMentioned(excerpt, playerName, [...subjectNames, ...otherNpcNames], {
            allowNarratorSecondPerson: excerptMatches[index]?.insideQuotedDialogue !== true,
            sourceRole: excerptMatches[index]?.sourceRole || '',
        }));`);

replaceOnce('src/scan-contract.js', `const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground it in THIS NPC\\'s player-facing interaction. One excerpt may directly bind NPC->PLAYER, or a small coherent set may use connected accepted identity/activity evidence from the same permitted source to supply source/target binding, so the summary need not repeat an already accepted narrator quote. Include narrator context when dialogue leaves the addressee ambiguous; quoted you alone is insufficient. Descriptive context may be established at zero numeric movement. The explanation interprets the evidence and need not copy its wording.';`, `const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground it in THIS NPC\\'s player-facing interaction. Player binding is POV-independent: first-person USER wording, second-person ASSISTANT narration, explicit PLAYER naming, or the same operation\\'s accepted exchangeActive identity/activity evidence may establish the participant context. One excerpt may bind NPC->PLAYER directly, or a small coherent same-source set may reuse accepted identity/activity evidence, so the summary need not repeat narrator text. Pronouns or quoted you alone are not authority when they are outside that accepted NPC exchange evidence or conflict with another addressee. Descriptive context may be established at zero numeric movement. The explanation interprets the evidence and need not copy its wording.';`);

replaceOnce('manifest.json', `    "version": "0.5.25",`, `    "version": "0.5.26",`);
replaceOnce('src/schema.js', `export const NPC_STATE_VERSION = '0.5.25';`, `export const NPC_STATE_VERSION = '0.5.26';`);
replaceOnce('DEVELOPMENT.md', `- Extension release: \`0.5.25\``, `- Extension release: \`0.5.26\``);
replaceOnce('tests/structure.test.mjs', `    assert.equal(manifest.version, '0.5.25');
    assert.match(schema, /NPC_STATE_VERSION = '0.5.25'/);`, `    assert.equal(manifest.version, '0.5.26');
    assert.match(schema, /NPC_STATE_VERSION = '0.5.26'/);`);

replaceOnce('docs/core-contract.md', `The summary validator must not combine unrelated passages, borrow another NPC/customer interaction, or reinterpret quoted second-person dialogue as narrator-addressed \`you\`; narrated dialogue whose surrounding narration does not bind the player remains ambiguous unless that exact excerpt already belongs to the accepted NPC evidence set.`, `Player binding is POV-independent. Explicit player names remain direct evidence; first-person wording in the current user source and second-person wording in assistant narration may bind the player only outside quoted dialogue. Third-person or dialogue-only wording may rely on the same-operation accepted exchangeActive activity/identity binding instead of a literal player pronoun, but only when the summary excerpts reuse that NPC's unambiguous accepted evidence from one permitted source. The summary validator must not combine unrelated passages, borrow another known NPC/customer interaction, or treat an isolated quoted \`you\` that is not part of accepted NPC activity as player proof.`);

replaceOnce('README.md', `## Release 0.5.25

0.5.25 generalizes exact relationship evidence matching for quoted dialogue slices. A model may return a verbatim prefix, middle, or suffix of one longer spoken line and surround that slice with its own outer quote delimiters; the matcher now ignores only those outer delimiters after proving the interior is an exact substring of one quoted-dialogue segment in the same permitted source. It still rejects fabricated text, wrong-source evidence, stitching across separate dialogue segments, dialogue-to-narration bridging, and structural/custom-tag bridging. Identity, activity, and Current Dynamic all use the same matcher, and numeric relationship scoring is unchanged. No scanner-prompt text or output allowance changed in this patch.`, `## Release 0.5.26

0.5.26 makes Current Dynamic player binding independent of first-, second-, or third-person prose. Direct evidence now understands USER first person, ASSISTANT narrator second person, and explicit PC names using source-role metadata; dialogue-only or third-person wording can instead reuse the same operation's accepted, unambiguous exchangeActive identity/activity evidence from one permitted source. Isolated pronouns, unowned same-scene quotes, wrong NPC/addressee evidence, and cross-source borrowing remain rejected. Numeric relationship scoring is unchanged.`);

replaceOnce('README.md', `- **0.5.25:** accept exact verbatim slices from within one longer quoted-dialogue segment even when the model adds outer quote delimiters, without allowing cross-segment or narration bridging.`, `- **0.5.25:** accept exact verbatim slices from within one longer quoted-dialogue segment even when the model adds outer quote delimiters, without allowing cross-segment or narration bridging.
- **0.5.26:** make Current Dynamic target binding POV-independent by combining source-role-aware direct PC references with same-source accepted exchange activity reuse, while preserving wrong-addressee and unowned-evidence rejection.`);

replaceRegexOnce('README.md', /Scanner input sizing is measured separately from foreground continuity and scanner output allowance\.[\s\S]*?These are local engineering estimates, not provider-reported usage\./, `Scanner input sizing is measured separately from foreground continuity and scanner output allowance. npm run measure:scan-prompts uses the existing local conservative estimator (ASCII/3.5 + non-ASCII*1.1) and the exact scanner system wrapper. __V0526_SCAN_MATRIX__ These are local engineering estimates, not provider-reported usage.`);

replaceOnce('README.md', `Current Dynamic may establish a neutral professional, transactional, adversarial, supervisory, or other role-defined relationship even when Trust/Affection/Desire/Tension remain zero. A newly established or materially changed summary uses bounded exact current-source evidence: one excerpt may bind NPC and player directly, or a small coherent set may reuse the already accepted NPC identity/activity binding from the same owned exchange. Unrelated passages, ambiguous role binding, fabricated/wrong-message excerpts, and quoted second-person dialogue without narrator/player binding remain rejected. The explanation is descriptive model interpretation and need not copy the source wording. Numeric relationship movement is separate and still requires its own stricter validated axis evidence.`, `Current Dynamic may establish a neutral professional, transactional, adversarial, supervisory, or other role-defined relationship even when Trust/Affection/Desire/Tension remain zero. A newly established or materially changed summary uses bounded exact current-source evidence: one excerpt may bind NPC and player directly, or a small coherent set may reuse the already accepted NPC identity/activity binding from the same owned exchange. PC binding is POV-independent: USER first person, ASSISTANT narrator second person, explicit PC names, and the model's already accepted same-source exchange activity can establish participant context without a hardcoded pronoun requirement. Unrelated passages, conflicting known addressees, fabricated/wrong-message excerpts, and isolated quoted second-person dialogue that is not part of the accepted NPC activity remain rejected. The explanation is descriptive model interpretation and need not copy the source wording. Numeric relationship movement is separate and still requires its own stricter validated axis evidence.`);

replaceOnce('CHANGELOG.md', `## 0.5.25`, `## 0.5.26

- Make descriptive Current Dynamic player binding POV-independent. Direct grounding now recognizes first-person references in the current USER source, second-person references in ASSISTANT narration, and explicit PC naming without treating quoted dialogue pronouns as direct authority.
- Add a same-operation exchange binding fallback for dialogue-only and third-person prose: when the NPC's identity, exchangeActive status, and exact activityEvidence are already accepted, relationshipSummaryEvidence may reuse that same NPC-owned evidence from one permitted source without repeating a literal PC pronoun.
- Preserve fail-closed boundaries: unowned same-scene quotations, cross-source borrowing, explicit known other-NPC addressees, fabricated evidence, and isolated quoted `you` outside the accepted NPC activity remain rejected. Numeric relationship scoring, gates, inertia, milestones, replay protection, and storage schema stay unchanged.
- Add production regressions for first-person USER prose, second-person NPC dialogue, third-person pronoun prose, known-other-addressee rejection, and unowned-dialogue rejection. Update Scan/Refresh contract wording and source-role evidence metadata without adding another model request or provider-specific behavior.

## 0.5.25`);

const testFile = `import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExchangeEvidencePolicy, profileEvidenceText, relationshipEvidenceText } from '../src/evidence-adapter.js';
import { relationshipEvidenceExcerptMatch } from '../src/relationship-evidence.js';
import { buildScanPrompt, buildTargetedRefreshPrompt, applyScanResult } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';

const PLAYER = 'Lucien Noctis';
const ZERO = Object.freeze({
    evaluated: true,
    impact: 'none',
    delta: { trust: 0, affection: 0, desire: 0, tension: 0 },
    axisEvidence: {},
    reason: 'Routine interaction with no numeric relationship movement.',
});

function safeState(key) {
    const state = createEmptyState(key);
    state.branchSafety = { status: 'safe' };
    return state;
}

function optionsFor(exchange) {
    const visible = [profileEvidenceText(exchange.user.mes), profileEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\\n');
    const relationship = [relationshipEvidenceText(exchange.user.mes), relationshipEvidenceText(exchange.assistant.mes)].filter(Boolean).join('\\n');
    return {
        sourceMessageId: 1,
        turn: 1,
        playerName: PLAYER,
        relationshipContext: relationship,
        profileContext: visible,
        semanticEvidenceContext: visible,
        evidencePolicy: buildExchangeEvidencePolicy(exchange),
        currentAdmissionText: visible,
        applyReturnedNpcPatches: true,
        applyRelationship: true,
        preservePresence: false,
        preserveObservation: true,
        requireDossierCoverage: false,
    };
}

function payloadFor({ name, identityExcerpt, activityExcerpts, summaryExcerpts = activityExcerpts, inChatExcerpt = identityExcerpt, summary = 'Professional first-contact interaction.' }) {
    return {
        exchangeActiveNpcIds: [name],
        inChatNpcIds: [name],
        worldActiveNpcIds: [],
        candidateAccounting: {},
        npcs: [{
            id: '',
            name,
            identityKind: 'named',
            identityEvidence: {
                anchor: name,
                excerpts: [identityExcerpt],
                explanation: 'Current visible evidence identifies the NPC.',
            },
            activityEvidence: {
                exchangeActive: {
                    excerpts: activityExcerpts,
                    explanation: 'The NPC participates directly in the current player-facing exchange.',
                },
                inChat: {
                    excerpts: [inChatExcerpt],
                    explanation: 'The NPC remains relevant in the scene.',
                },
            },
            relationshipChange: structuredClone(ZERO),
            relationshipSummary: summary,
            relationshipSummaryEvidence: {
                excerpts: summaryExcerpts,
                explanation: 'The evidence establishes the current NPC-player interaction without numeric movement.',
            },
        }],
        socialEdges: [],
        familyFacts: [],
        lifeStateUpdates: [],
    };
}

function assertNeutralApplied(result, name, summary) {
    const npc = result.state.npcs.find(row => row.name === name);
    assert.ok(npc);
    assert.equal(npc.relationshipSummary, summary);
    assert.deepEqual(npc.relationship, { trust: 0, affection: 0, desire: 0, tension: 0 });
    assert.equal(npc.relationshipHistory.length, 0);
    assert.equal(npc.relationshipEvidenceHistory.length, 0);
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'applied');
}

test('first-person USER prose binds the PC directly without requiring literal player naming', () => {
    const user = 'I place my signed form beneath Hesta Vale’s hand and ask her to check it.';
    const assistant = 'Hesta Vale scans the form and taps the approval box.';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: user },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: assistant },
    };
    const policy = buildExchangeEvidencePolicy(exchange);
    const match = relationshipEvidenceExcerptMatch(user, policy.relationshipSources);
    assert.equal(match?.sourceRole, 'user');

    const summary = 'Professional clerk-applicant intake interaction.';
    const result = applyScanResult(safeState('chat:v0526-first-person'), payloadFor({
        name: 'Hesta Vale', identityExcerpt: user, activityExcerpts: [user], inChatExcerpt: assistant, summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Hesta Vale', summary);
});

test('accepted exchange activity binds second-person NPC dialogue without narrator you', () => {
    const identity = 'Talia Brant slapped three pinned slips across the scarred oak counter.';
    const first = '"Sign the lower line, name or mark, don\'t drip slush on the blotter."';
    const second = '"The butcher wants the tallow and the hams. The farmers just want them dead. Which line are you putting your name to?"';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I wait at the intake counter for the clerk to finish.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: [identity, first, second].join('\\n\\n') },
    };
    const summary = 'Professional and curt Guild intake clerk processing Lucien’s registration and contract selection.';
    const result = applyScanResult(safeState('chat:v0526-second-person-dialogue'), payloadFor({
        name: 'Talia Brant', identityExcerpt: identity, activityExcerpts: [first, identity, second], summaryExcerpts: [first, identity, second], summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Talia Brant', summary);
});

test('accepted exchange activity binds third-person pronoun prose without a hardcoded pronoun resolver', () => {
    const activity = 'Oren Vale set the registration board before him and waited while he signed the lower line.';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'Lucien approaches the registry desk.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: activity },
    };
    const summary = 'Routine registrar-applicant interaction.';
    const result = applyScanResult(safeState('chat:v0526-third-person'), payloadFor({
        name: 'Oren Vale', identityExcerpt: activity, activityExcerpts: [activity], summary,
    }), optionsFor(exchange));
    assertNeutralApplied(result, 'Oren Vale', summary);
});

test('accepted activity cannot lend Current Dynamic to an explicitly different known addressee', () => {
    const activity = 'Talia Brant turns from the counter to Mira Vale and pushes the ledger toward her. "Which line are you signing?"';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I wait beside Mira Vale at the counter.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: activity },
    };
    const state = safeState('chat:v0526-other-addressee');
    state.npcs = [normalizeNpc({ id: 'mira', name: 'Mira Vale', present: true })];
    const result = applyScanResult(state, payloadFor({
        name: 'Talia Brant', identityExcerpt: activity, activityExcerpts: [activity],
        summary: 'Talia directs Lucien through registration.',
    }), optionsFor(exchange));
    const talia = result.state.npcs.find(row => row.name === 'Talia Brant');
    assert.ok(talia);
    assert.equal(talia.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('isolated quoted you outside accepted NPC activity remains rejected', () => {
    const identity = 'Nelda Hessel stands behind the Rimecross intake desk.';
    const quote = '"You should sign the blue column."';
    const exchange = {
        user: { id: 0, is_user: true, name: PLAYER, mes: 'I approach the desk.' },
        assistant: { id: 1, is_user: false, name: 'Narrator', mes: identity + '\\n\\n' + quote },
    };
    const result = applyScanResult(safeState('chat:v0526-unowned-you'), payloadFor({
        name: 'Nelda Hessel', identityExcerpt: identity, activityExcerpts: [identity], summaryExcerpts: [identity, quote],
        summary: 'Nelda directs Lucien to sign the blue column.',
    }), optionsFor(exchange));
    const nelda = result.state.npcs.find(row => row.name === 'Nelda Hessel');
    assert.ok(nelda);
    assert.equal(nelda.relationshipSummary, '');
    const diagnostic = result.semanticDiagnostics.find(row => row.field === 'relationshipSummary');
    assert.equal(diagnostic?.status, 'rejected-proposal');
    assert.equal(diagnostic?.reason, 'wrong-summary-target');
});

test('Scan and Refresh advertise POV-independent Current Dynamic binding through accepted exchange evidence', () => {
    const chat = [
        { id: 0, is_user: true, name: PLAYER, mes: 'I hand the clerk my form.' },
        { id: 1, is_user: false, name: 'Narrator', mes: 'Hesta Vale checks the form.' },
    ];
    const scan = buildScanPrompt({ state: safeState('chat:v0526-prompt'), chat, assistantMessageId: 1, playerName: PLAYER });
    const refresh = buildTargetedRefreshPrompt({ npc: normalizeNpc({ id: 'hesta', name: 'Hesta Vale' }), chat, assistantMessageId: 1, playerName: PLAYER });
    for (const prompt of [scan, refresh]) {
        assert.match(prompt, /POV-independent/i);
        assert.match(prompt, /first-person USER/i);
        assert.match(prompt, /accepted exchangeActive identity\/activity evidence/i);
        assert.match(prompt, /quoted you alone/i);
    }
});
`;
write('tests/v0526-pov-target-binding.test.mjs', testFile);

console.log('v0.5.26 source/test/doc patch staged in working tree');
