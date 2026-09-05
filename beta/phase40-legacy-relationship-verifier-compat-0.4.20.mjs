import fs from 'node:fs';

function write(path, transform) {
    const before = fs.readFileSync(path, 'utf8');
    const after = transform(before);
    if (after === before) throw new Error('v0.4.20 compatibility transform made no change: ' + path);
    fs.writeFileSync(path, after);
}

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.20 verifier compatibility marker: ' + label);
    return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
    if (source.includes(replacement)) return source;
    const start = source.indexOf(startMarker);
    const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
    if (start < 0 || end < 0) throw new Error('Missing v0.4.20 verifier section: ' + label);
    return source.slice(0, start) + replacement + '\n\n' + source.slice(end);
}

const axisHelper = `function v0420RelationshipContract(delta, evidence, reason) {
    const fullDelta = { trust: 0, affection: 0, desire: 0, tension: 0, ...delta };
    const priority = ['trust', 'affection', 'desire', 'tension'].filter(axis => Number(fullDelta[axis]) !== 0);
    const axisEvidence = Object.fromEntries(priority.map(axis => [axis, { excerpts: [evidence], explanation: reason || 'Verifier relationship judgment.' }]));
    return { fullDelta, priority, axisEvidence };
}`;

// v0.4.2 weighted progression fixtures now use explicit per-axis quotation provenance.
write('beta/verify-phase1-relationship-hardening-0.4.2.mjs', source => {
    if (!source.includes('function v0420RelationshipContract')) {
        source = source.replace('function milestone(axis, polarity, threshold) {', axisHelper + '\n\nfunction milestone(axis, polarity, threshold) {');
    }
    source = replaceSection(source, 'function apply(state, {', 'const mira = state =>', `function apply(state, { impact = 'ordinary', delta = {}, evidence = 'Fresh grounded evidence.', reason = 'Fresh relationship event.', summary = '', sourceMessageId = 2, turn = sourceMessageId, context = '' } = {}) {
    const contract = v0420RelationshipContract(delta, evidence, reason);
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-phase1'],
        inChatNpcIds: ['npc-mira-phase1'],
        worldActiveNpcIds: [],
        npcs: [{
            id: 'npc-mira-phase1',
            name: 'Mira',
            relationshipSummary: summary,
            relationshipChange: {
                evaluated: true,
                impact,
                delta: contract.fullDelta,
                priority: contract.priority,
                axisEvidence: contract.axisEvidence,
                evidence,
                reason,
            },
        }],
        socialEdges: [],
    }, {
        sourceMessageId,
        turn,
        relationshipContext: context || evidence,
        applyReturnedNpcPatches: true,
    }).state;
}` , 'phase1 apply helper');
    source = replaceRequired(source,
        `// Ambiguous equal-strength overflow is rejected rather than biased by fixed axis order.`,
        `// Equal-strength overflow fills the available slots deterministically when no model priority is supplied.`,
        'phase1 tied overflow comment');
    source = replaceRequired(source,
        `    assert(mira(state).relationship.trust === 0 && mira(state).relationship.affection === 0 && mira(state).relationship.tension === 0, 'Equal tied overflow created deterministic axis bias');`,
        `    assert(mira(state).relationship.trust === 2 && mira(state).relationship.affection === 2, 'Equal tied overflow did not fill meaningful-tier slots');\n    assert(mira(state).relationship.tension === 0, 'Equal tied overflow exceeded the meaningful-tier axis limit');`,
        'phase1 tied overflow expectation');
    source = replaceRequired(source,
        `// Desire is blocked unless both the model evidence and actual current narration contain\n// explicit romantic/intimate/physical-attraction evidence.`,
        `// Desire is not keyword-vetoed by runtime. Provenance still fails closed when the model quotes\n// text that is absent from the permitted current exchange; an exact supported quote may proceed.`,
        'phase1 Desire comment');
    source = replaceRequired(source,
        `        evidence: 'Mira explicitly admits she is romantically attracted to the player.',`,
        `        evidence: 'Mira says she is romantically attracted to the player and asks for a kiss.',`,
        'phase1 exact Desire quote');
    return source;
});

// v0.4.7 recovery/idempotency fixtures use per-axis evidence. Exact repeated quotations remain
// duplicate-safe across messages, but distinct later events are not blocked by fuzzy similarity.
write('beta/verify-phase12-relationship-recovery-0.4.7.mjs', source => {
    source = replaceSection(source, 'function payload(evidence, delta = { trust: 1 }, impact = \'meaningful\') {', 'function apply(state, evidence,', `function payload(evidence, delta = { trust: 1 }, impact = 'meaningful') {
    const fullDelta = { trust: 0, affection: 0, desire: 0, tension: 0, ...delta };
    const priority = ['trust', 'affection', 'desire', 'tension'].filter(axis => Number(fullDelta[axis]) !== 0);
    const axisEvidence = Object.fromEntries(priority.map(axis => [axis, { excerpts: [evidence], explanation: 'A new event changes this relationship axis.' }]));
    return { exchangeActiveNpcIds: [id], inChatNpcIds: [id], npcs: [{ id, name: 'Mira', relationshipChange: {
        evaluated: true, evidence, reason: 'A new event changes the relationship.', delta: fullDelta, impact, priority, axisEvidence,
    } }] };
}` , 'phase12 payload helper');
    source = replaceRequired(source, `assert.deepEqual(last(state).reasons, ['duplicate']);`, `assert(last(state).reasons.includes('trust:duplicate'));`, 'phase12 duplicate diagnostic');
    source = source.replaceAll("assert(last(after).reasons.includes('trust:contradictory'));", "assert(last(after).reasons.includes('trust:unverifiable-excerpt'));");
    source = replaceRequired(source,
        `test('axis-limit rejections are visible without changing scores', () => {\n    const after = apply(stateWith(), 'Mira thanks Lucien for rescuing her.', { trust: 1, affection: 1 }, 'ordinary');\n    assert.equal(npc(after).relationship.trust, 0);\n    assert(last(after).reasons.includes('trust:axis-limit'));\n    assert(last(after).reasons.includes('affection:axis-limit'));\n});`,
        `test('axis-limit rejections fill available slots deterministically', () => {\n    const after = apply(stateWith(), 'Mira thanks Lucien for rescuing her.', { trust: 1, affection: 1 }, 'ordinary');\n    assert.equal(npc(after).relationship.trust, 1);\n    assert.equal(npc(after).relationship.affection, 0);\n    assert(last(after).reasons.includes('affection:axis-limit'));\n});`,
        'phase12 tied axis limit');
    return source;
});

write('beta/verify-phase13-milestone-gate-invariants-0.4.8.mjs', source => {
    source = replaceSection(source, 'function applyEvent(state, {', 'function npc(state)', `function applyEvent(state, { axis = 'trust', delta, impact, caps, evidence, messageId = 2 }) {
    const relationshipDelta = { trust: 0, affection: 0, desire: 0, tension: 0, [axis]: delta };
    const payload = {
        exchangeActiveNpcIds: [id], inChatNpcIds: [id],
        npcs: [{ id, name: 'Mira', relationshipChange: {
            evaluated: true, impact, delta: relationshipDelta, priority: [axis],
            axisEvidence: { [axis]: { excerpts: [evidence], explanation: 'A newly grounded event changes this relationship axis.' } },
            evidence, reason: 'A newly grounded event changes this relationship axis.',
        } }],
    };
    return applyScanResult(state, payload, {
        sourceMessageId: messageId, turn: messageId, relationshipContext: evidence,
        relationshipCaps: caps, applyReturnedNpcPatches: true,
    }).state;
}` , 'phase13 applyEvent helper');
    return source;
});

// Historical semantic helper behavior remains separately tested, but runtime integration no longer
// treats those keyword heuristics as authority. Invalid integration fixtures fail on quotation provenance.
for (const path of ['beta/verify-phase17-second-order-hardening-0.4.12.mjs', 'beta/verify-phase20-semantic-isolation-0.4.13.mjs']) {
    write(path, source => {
        source = source.replaceAll(
            `impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            evidence: 'Sora trusts Lucien completely.', reason: 'Trust deepens.',`,
            `evaluated: true, impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            priority: ['trust'], axisEvidence: { trust: { excerpts: ['Mira trusts Lucien completely.'], explanation: 'Verifier intentionally supplies an excerpt absent from the current exchange.' } },\n            evidence: 'Sora trusts Lucien completely.', reason: 'Trust deepens.',`,
        );
        source = source.replaceAll(
            `assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:wrong-direction'));`,
            `assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:unverifiable-excerpt'));`,
        );
        source = source.replaceAll(
            `impact: 'meaningful', delta: { trust: 0, affection: 1, desire: 0, tension: 0 },\n            evidence: 'Mira does not love Lucien.', reason: 'Affection deepens.',`,
            `evaluated: true, impact: 'meaningful', delta: { trust: 0, affection: 1, desire: 0, tension: 0 },\n            priority: ['affection'], axisEvidence: { affection: { excerpts: ['Mira openly loves Lucien.'], explanation: 'Verifier intentionally supplies an excerpt absent from the current exchange.' } },\n            evidence: 'Mira does not love Lucien.', reason: 'Affection deepens.',`,
        );
        source = source.replaceAll(
            `assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:evidence-polarity'));`,
            `assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:unverifiable-excerpt'));`,
        );
        // Positive historical integration fixtures need explicit exact provenance too.
        source = source.replaceAll(
            `impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 0, tension: -1 },\n            evidence: 'Mira feels her tension easing around Lucien.', reason: 'Tension eases.',`,
            `evaluated: true, impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 0, tension: -1 },\n            priority: ['tension'], axisEvidence: { tension: { excerpts: ['Mira feels her tension easing around Lucien.'], explanation: 'Verifier tension judgment.' } },\n            evidence: 'Mira feels her tension easing around Lucien.', reason: 'Tension eases.',`,
        );
        source = source.replaceAll(
            `impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            evidence: 'Mira is no longer afraid and trusts Lucien.', reason: 'Trust grows.',`,
            `evaluated: true, impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n            priority: ['trust'], axisEvidence: { trust: { excerpts: ['Mira is no longer afraid and trusts Lucien.'], explanation: 'Verifier trust judgment.' } },\n            evidence: 'Mira is no longer afraid and trusts Lucien.', reason: 'Trust grows.',`,
        );
        return source;
    });
}

// v0.4.16 keeps the historical semantic helper tests, but runtime integration is now exact-source based.
write('beta/verify-phase28-relationship-semantic-grounding-0.4.16.mjs', source => {
    source = replaceRequired(source,
        `                impact: 'ordinary',\n                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n                evidence: 'Lucien demonstrated straightforward competence and reliability.',\n                reason: 'Lucien completed his first local bounty promptly and cleanly before sundown.',`,
        `                evaluated: true,\n                impact: 'ordinary',\n                delta: { trust: 1, affection: 0, desire: 0, tension: 0 },\n                priority: ['trust'],\n                axisEvidence: { trust: { excerpts: ['Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk.'], explanation: 'Verifier model judgment: Kora treated the completed work as evidence of reliability.' } },\n                evidence: 'Lucien demonstrated straightforward competence and reliability.',\n                reason: 'Lucien completed his first local bounty promptly and cleanly before sundown.',`,
        'phase28 integration contract');
    source = replaceRequired(source,
        `assert(scanner.includes('impact: change.impact') && (scanner.includes('delta: change.delta') || scanner.includes('delta: axisDelta')), 'Scanner does not pass movement semantics into relationship grounding');`,
        `assert(scanner.includes('relationshipAxisProvenance') && scanner.includes('relationshipEvidenceExcerptMatch'), 'Scanner does not validate per-axis quotation provenance');\nassert(!scanner.includes('relationshipEvidenceGrounding('), 'Legacy semantic grounding still authorizes runtime movement');`,
        'phase28 runtime source assertion');
    return source;
});

write('beta/verify-phase29-release-source-parity-0.4.16.mjs', source => {
    source = replaceRequired(source,
        `assert(scanner.includes('impact: change.impact') && (scanner.includes('delta: change.delta') || scanner.includes('delta: axisDelta')), 'Scanner does not pass relationship movement semantics into grounding');`,
        `assert(scanner.includes('relationshipAxisProvenance') && scanner.includes('relationshipEvidenceExcerptMatch'), 'Scanner no longer validates current per-axis quotation provenance');\nassert(!scanner.includes('relationshipEvidenceGrounding('), 'Legacy semantic grounding remains a runtime authorization path');`,
        'phase29 scanner assertion');
    source = replaceRequired(source,
        `assert(workflow.includes('ordinaryTrustSemanticGrounding') || workflow.includes('relationshipSemanticGrounding'), 'Architecture gate does not guard semantic relationship grounding');`,
        `assert(workflow.includes('relationshipEvidenceExcerptMatch') && workflow.includes('relationshipSources'), 'Architecture gate does not guard current relationship quotation provenance');`,
        'phase29 workflow assertion');
    return source;
});

write('beta/verify-phase30-relationship-progression-0.4.17.mjs', source => {
    source = replaceSection(source, 'function applyTrust(state, {', '// Aligned deepening bands:', `function applyTrust(state, { impact, delta, messageId = 10, label = 'verified event' }) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-kora'], inChatNpcIds: ['npc-kora'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-kora', name: 'Kora Lind', relationshipChange: {
            evaluated: true, impact,
            delta: { trust: delta, affection: 0, desire: 0, tension: 0 },
            priority: ['trust'],
            axisEvidence: { trust: { excerpts: [label], explanation: 'Verifier trust judgment for progression mechanics.' } },
            evidence: label, reason: label,
        } }],
        socialEdges: [], familyFacts: [],
    }, {
        sourceMessageId: messageId, turn: messageId, playerName: 'Lucien',
        relationshipContext: label,
        requireCurrentRelationshipEvidence: false, applyReturnedNpcPatches: true,
    }).state.npcs[0];
}` , 'phase30 applyTrust helper');
    return source;
});

write('beta/verify-phase33-relationship-evaluation-observability-0.4.18.mjs', source => {
    source = replaceRequired(source,
        `assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('evaluation-invalid'), 'Malformed attempted relationship change was not diagnosed');`,
        `assert(greta.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:missing-axis-evidence'), 'Malformed attempted relationship change was not diagnosed precisely');`,
        'phase33 malformed diagnostic');
    source = replaceRequired(source,
        `                delta: { ...ZERO, trust: 1 },\n                evidence: 'Lucien paid exactly as promised and returned the room key to Greta.',\n                reason: 'Lucien followed through reliably on a small commitment.',`,
        `                delta: { ...ZERO, trust: 1 },\n                priority: ['trust'],\n                axisEvidence: { trust: { excerpts: ['Lucien paid exactly as promised and returned the room key to Greta.'], explanation: 'Verifier trust judgment for reliable follow-through.' } },\n                evidence: 'Lucien paid exactly as promised and returned the room key to Greta.',\n                reason: 'Lucien followed through reliably on a small commitment.',`,
        'phase33 accepted evidence');
    source = replaceRequired(source,
        `    });\n    assert.equal(greta.relationship.trust, 1, 'Normal accepted Trust movement regressed');`,
        `    }, { relationshipContext: 'Lucien paid exactly as promised and returned the room key to Greta.' });\n    assert.equal(greta.relationship.trust, 1, 'Normal accepted Trust movement regressed');`,
        'phase33 accepted context');
    source = replaceRequired(source,
        `assert(dossier.includes('Required relationship evaluation was omitted by the scanner.'), 'Dossier lacks omission display');`,
        `assert(dossier.includes('No score change.') && dossier.includes('Overall:'), 'Dossier lacks precise zero/omission display');`,
        'phase33 dossier assertion');
    return source;
});

write('beta/verify-phase35-release-source-parity-0.4.18.mjs', source => {
    source = replaceRequired(source,
        `assert(dossier.includes('Required relationship evaluation was omitted by the scanner.'), 'Dossier omission message is missing');`,
        `assert(dossier.includes('No score change.') && dossier.includes('Overall:'), 'Dossier zero/omission telemetry is missing');`,
        'phase35 dossier assertion');
    return source;
});

// Rewrite the v0.4.19 integration verifier onto the v0.4.20 provenance contract while retaining
// its partial-axis and original-proposal regression intent.
write('beta/verify-phase36-per-axis-relationship-grounding-0.4.19.mjs', source => {
    source = replaceSection(source, '// A weak extra axis must not poison a grounded Trust movement.', 'const scanner = fs.readFileSync', `// A weak extra axis must not poison a provenance-valid Trust movement.
{
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 1, desire: 0, tension: 0 }, priority: ['trust', 'affection'],
        axisEvidence: {
            trust: { excerpts: ['Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk.'], explanation: 'Verifier trust judgment.' },
            affection: { excerpts: ['Kora smiled warmly at Lucien.'], explanation: 'Verifier intentionally fabricates the weaker axis quote.' },
        },
        evidence: 'Mixed verifier proposal.', reason: 'Trust quote exists; Affection quote does not.',
    }, performanceContext);
    assert.equal(kora.relationship.trust, 2, 'Provenance-valid Trust was discarded because another axis was weak');
    assert.equal(kora.relationship.affection, 0, 'Unverifiable Affection was incorrectly applied');
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('affection:unverifiable-excerpt'));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
    assert.equal(kora.relationshipEvidenceHistory.length, 1);
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.trust, 2);
    assert.equal(kora.relationshipEvidenceHistory.at(-1)?.delta?.affection, 0);
    assert.equal(kora.relationshipDiagnostics.at(-1)?.proposed?.affection, 1);
}

// An unverifiable Desire quote must not suppress independently provenance-valid de-escalation.
{
    const context = 'Lucien lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 1, tension: -1 }, priority: ['tension', 'desire'],
        axisEvidence: {
            tension: { excerpts: [context], explanation: 'Verifier tension judgment.' },
            desire: { excerpts: ['Kora pulled Lucien into a hungry kiss.'], explanation: 'Verifier intentionally fabricates this quote.' },
        },
        evidence: 'Mixed verifier proposal.', reason: 'Tension quote exists; Desire quote does not.',
    }, context);
    assert.equal(kora.relationship.tension, -1, 'Provenance-valid Tension reduction was discarded with invalid Desire');
    assert.equal(kora.relationship.desire, 0);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('desire:unverifiable-excerpt'));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
}

// Multiple independently provenance-valid axes survive together when the tier permits them.
{
    const context = 'Lucien completed Kora\\'s contract before dusk and delivered the intact proof. Kora accepted the work. Lucien then lowered his weapon and reassured Kora that she was safe.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 0, desire: 0, tension: -1 }, priority: ['trust', 'tension'],
        axisEvidence: {
            trust: { excerpts: ['Lucien completed Kora\\'s contract before dusk and delivered the intact proof.'], explanation: 'Verifier trust judgment.' },
            tension: { excerpts: ['Lucien then lowered his weapon and reassured Kora that she was safe.'], explanation: 'Verifier tension judgment.' },
        },
        evidence: 'Two-source verifier proposal.', reason: 'Two independently quoted effects.',
    }, context);
    assert.equal(kora.relationship.trust, 2);
    assert.equal(kora.relationship.tension, -1);
}

// If every proposed quotation is absent, no score/history movement is created.
{
    const context = 'Sora delivered the bounty proof to Kora while Lucien waited across the room.';
    const kora = applyKora({
        impact: 'meaningful', delta: { trust: 2, affection: 1, desire: 0, tension: 0 }, priority: ['trust', 'affection'],
        axisEvidence: {
            trust: { excerpts: ['Lucien completed the bounty himself.'], explanation: 'Absent verifier quote.' },
            affection: { excerpts: ['Kora embraced Lucien.'], explanation: 'Absent verifier quote.' },
        },
        evidence: 'Fully invalid verifier proposal.', reason: 'No quoted support exists.',
    }, context);
    assert.deepEqual(kora.relationship, ZERO);
    assert.equal(kora.relationshipEvidenceHistory.length, 0);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('trust:')));
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.some(reason => reason.startsWith('affection:')));
    assert(!kora.relationshipDiagnostics.at(-1)?.reasons?.includes('partial-applied'));
}

// Single-axis behavior remains intact.
{
    const kora = applyKora({
        impact: 'ordinary', delta: { trust: 1, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],
        axisEvidence: { trust: { excerpts: ['Lucien delivered three intact pairs of lower tusks for the brush-boar contract before dusk.'], explanation: 'Verifier trust judgment.' } },
        evidence: 'Single-axis verifier proposal.', reason: 'Exact quote is present.',
    }, performanceContext);
    assert.equal(kora.relationship.trust, 1);
    assert(kora.relationshipDiagnostics.at(-1)?.reasons?.includes('applied'));
}

` , 'phase36 integration cases');
    source = source.replace("assert(scanner.includes('function relationshipAxisGrounding'), 'Per-axis grounding helper is missing');", "assert(scanner.includes('function relationshipAxisProvenance'), 'Per-axis provenance helper is missing');");
    source = source.replace("assert(scanner.includes(\"reasons.push(axis + ':' + rejection)\"), 'Axis-specific grounding diagnostics are missing');", "assert(scanner.includes('axisEvidenceStatus'), 'Axis-specific evidence diagnostics are missing');");
    source = source.replace("assert(scanner.includes(\"axis + ':evidence-polarity'\"), 'Axis-specific polarity diagnostics are missing');", "assert(scanner.includes(\"axis + ':unverifiable-excerpt'\"), 'Axis-specific provenance diagnostics are missing');");
    source = source.replace("assert(scanner.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Recovery scanner lacks per-axis evidence guidance');", "assert(scanner.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Recovery scanner lacks per-axis evidence guidance');");
    source = source.replace("assert(injection.includes('MULTI-AXIS RELATIONSHIP EVIDENCE'), 'Foreground scanner lacks per-axis evidence guidance');", "assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Foreground scanner lacks per-axis evidence guidance');");
    source = source.replace("assert.equal(manifest.version, '0.4.19');", "assert(String(manifest.version).startsWith('0.4.') && Number(String(manifest.version).split('.')[2]) >= 19);");
    return source;
});

// v0.4.19 source parity remains useful as a descendant check, but its runtime authority moved in v0.4.20.
write('beta/verify-phase38-release-source-parity-0.4.19.mjs', source => {
    const replacement = `import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = path => fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const scanner = read('v03/scanner.js');
const injection = read('v03/injection.js');
const phase36 = read('beta/phase36-per-axis-relationship-grounding-0.4.19.mjs');
const verify36 = read('beta/verify-phase36-per-axis-relationship-grounding-0.4.19.mjs');
const workflow = read('.github/workflows/seed-beta.yml');
const patch = Number(String(manifest.version || '').split('.')[2]);
assert(String(manifest.version).startsWith('0.4.') && patch >= 19, 'Release source regressed below v0.4.19');
assert(phase36.includes('relationshipAxisGrounding'), 'Historical v0.4.19 per-axis transform source is missing');
assert(verify36.includes('another axis was weak'), 'Historical mixed-axis regression intent is not persisted');
assert(scanner.includes('relationshipAxisProvenance') && scanner.includes('relationshipEvidenceExcerptMatch'), 'Descendant runtime lacks v0.4.20 per-axis provenance');
assert(!scanner.includes('relationshipEvidenceGrounding('), 'Descendant runtime restored legacy semantic authorization');
assert(injection.includes('PER-AXIS RELATIONSHIP EVIDENCE'), 'Descendant foreground contract lacks per-axis evidence');
assert(workflow.includes('node beta/bump-0.4.19.mjs'), 'Workflow no longer preserves the v0.4.19 build step');
assert(workflow.includes('node beta/bump-0.4.20.mjs'), 'Workflow does not apply the v0.4.20 descendant');
assert(workflow.includes('Generated beta runtime already matches build output.'));
console.log('NPC State 0.4.19 release source parity verified for v0.4.20+ descendant');`;
    if (!source.includes("assert.equal(manifest.version, '0.4.19'")) throw new Error('Unexpected phase38 verifier shape');
    return replacement + '\n';
});

// New-NPC relationship fixtures now use exact current-exchange quotations.
write('beta/verify-phase7b-new-npc-history-enrichment-0.4.2.mjs', source => {
    source = source.replaceAll(
        `impact: 'meaningful',\n                delta: { trust: 2, affection: 0, desire: 0, tension: 0 },\n                evidence: 'Years ago Lucien saved Mara from a burning mill.',`,
        `evaluated: true, impact: 'meaningful',\n                delta: { trust: 2, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],\n                axisEvidence: { trust: { excerpts: ['Years ago Lucien saved Mara from a burning mill.'], explanation: 'Historical verifier quote should fail current-exchange provenance.' } },\n                evidence: 'Years ago Lucien saved Mara from a burning mill.',`,
    );
    source = source.replaceAll(
        `impact: 'meaningful',\n                delta: { trust: 2, affection: 0, desire: 0, tension: 0 },\n                evidence: 'Mara entrusts Lucien with the key to her locked workshop.',`,
        `evaluated: true, impact: 'meaningful',\n                delta: { trust: 2, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],\n                axisEvidence: { trust: { excerpts: ['Mara entrusts Lucien with the key to her locked workshop.'], explanation: 'Current verifier trust judgment.' } },\n                evidence: 'Mara entrusts Lucien with the key to her locked workshop.',`,
    );
    return source;
});

write('beta/verify-phase7c-existing-relationship-evidence-grounding-0.4.3.mjs', source => {
    source = replaceRequired(source,
        `            impact: 'meaningful',\n            delta: { trust: 2, affection: 0, desire: 0, tension: 0 },\n            evidence: 'Mira explicitly entrusts Lucien with the only key to her private archive.',`,
        `            evaluated: true, impact: 'meaningful',\n            delta: { trust: 2, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],\n            axisEvidence: { trust: { excerpts: ['Mira explicitly entrusts Lucien with the only key to her private archive.'], explanation: 'Verifier trust judgment.' } },\n            evidence: 'Mira explicitly entrusts Lucien with the only key to her private archive.',`,
        'phase7c proposal contract');
    source = replaceRequired(source,
        `// Direct low-level calls that intentionally omit relationshipContext retain backward-compatible\n// behavior for test/import helpers; production automatic scan paths always supply current context.`,
        `// Direct low-level calls that omit a permitted relationship source now fail closed. Existing saves\n// remain readable, but missing current provenance does not silently authorize new movement.`,
        'phase7c contextless comment');
    source = replaceRequired(source,
        `assert(mira.relationship.trust > 10 || Number(mira.relationshipProgress?.trust || 0) > 0, 'Context-less compatibility path was unintentionally disabled');`,
        `assert(mira.relationship.trust === 10, 'Context-less low-level proposal silently authorized movement');\nassert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('trust:no-permitted-evidence-source'));`,
        'phase7c contextless expectation');
    return source;
});

write('beta/verify-relationship-milestone-gates-0.4.1.mjs', source => {
    source = replaceSection(source, 'function applyTrust(state, {', 'function mira(state)', `function applyTrust(state, { impact, delta, sourceMessageId = 2, evidence = ({2: 'Mira receives a map during the blizzard.', 3: 'Lucien returns her stolen ancestral heirloom.', 4: 'They survive a dangerous rescue on the mountain.'})[sourceMessageId], reason = 'Current exchange changes trust.' }) {
    return applyScanResult(state, {
        exchangeActiveNpcIds: ['npc-mira-test'], inChatNpcIds: ['npc-mira-test'], worldActiveNpcIds: [],
        npcs: [{ id: 'npc-mira-test', name: 'Mira', relationshipChange: {
            evaluated: true, impact,
            delta: { trust: delta, affection: 0, desire: 0, tension: 0 }, priority: ['trust'],
            axisEvidence: { trust: { excerpts: [evidence], explanation: reason } }, evidence, reason,
        } }],
        socialEdges: [],
    }, { sourceMessageId, turn: sourceMessageId, relationshipContext: evidence, applyReturnedNpcPatches: true }).state;
}` , 'milestone applyTrust helper');
    return source;
});

console.log('Migrated historical relationship verifiers to the NPC State 0.4.20 evidence contract');
