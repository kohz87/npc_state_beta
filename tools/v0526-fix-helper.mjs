import fs from 'node:fs';
const path = 'tools/v0526-patch.mjs';
let source = fs.readFileSync(path, 'utf8');

const markdownFrom = 'and isolated quoted `you` outside the accepted NPC activity remain rejected.';
const markdownTo = 'and isolated quoted \\`you\\` outside the accepted NPC activity remain rejected.';
if (!source.includes(markdownFrom)) throw new Error('expected helper markdown fragment not found');
source = source.replace(markdownFrom, markdownTo);

const fixtureFrom = "don\\'t drip slush on the blotter";
if (!source.includes(fixtureFrom)) throw new Error('expected generated test fixture fragment not found');
source = source.replace(fixtureFrom, 'do not drip slush on the blotter');

const regexFrom = String.raw`assert.match(prompt, /accepted exchangeActive identity\/activity evidence/i);`;
const regexTo = 'assert.match(prompt, /accepted exchangeActive identity.*activity evidence/i);';
if (!source.includes(regexFrom)) throw new Error('expected generated prompt assertion not found');
source = source.replace(regexFrom, regexTo);

const fallbackFrom = String.raw`    return [...povBoundSummarySources].some(sourceId => summarySourceSafe(sourceId)
        && excerpts.every(excerpt => summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)
            || summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedIdentityExcerpts)));`;
const fallbackTo = String.raw`    return [...povBoundSummarySources].some(sourceId => summarySourceSafe(sourceId)
        // A competing known NPC mention makes the fallback ambiguous even when the same
        // excerpt also addresses the player. Direct target binding may still handle an
        // explicitly resolved group interaction, but the POV-neutral bridge stays fail-closed.
        && excerpts.every(excerpt => !identityMentioned(excerpt, otherNpcNames, subjectNames))
        && excerpts.every(excerpt => summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedActivityExcerpts)
            || summaryExcerptOverlapsAcceptedActivity(excerpt, acceptedIdentityExcerpts)));`;
if (!source.includes(fallbackFrom)) throw new Error('expected POV fallback fragment not found');
source = source.replace(fallbackFrom, fallbackTo);

const promptFrom = "const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground it in THIS NPC\\\\'s player-facing interaction. Player binding is POV-independent: first-person USER wording, second-person ASSISTANT narration, explicit PLAYER naming, or the same operation\\\\'s accepted exchangeActive identity/activity evidence may establish the participant context. One excerpt may bind NPC->PLAYER directly, or a small coherent same-source set may reuse accepted identity/activity evidence, so the summary need not repeat narrator text. Pronouns or quoted you alone are not authority when they are outside that accepted NPC exchange evidence or conflict with another addressee. Descriptive context may be established at zero numeric movement. The explanation interprets the evidence and need not copy its wording.';";
const promptTo = "const CURRENT_DYNAMIC_EVIDENCE_RULE = 'CURRENT DYNAMIC EVIDENCE: new/changed relationshipSummary needs relationshipSummaryEvidence:{excerpts:[1-3 exact permitted quotes],explanation}. Ground THIS NPC->PLAYER interaction. Player binding is POV-independent: first-person USER, second-person ASSISTANT narration, explicit PLAYER name, or accepted exchangeActive identity/activity evidence. One excerpt may bind directly; a small coherent set may use connected accepted identity/activity evidence from the same permitted source and need not repeat an already accepted narrator quote; quoted you alone is insufficient; another addressee conflicts. zero numeric movement is allowed; explanation interprets the evidence.';";
if (!source.includes(promptFrom)) throw new Error('expected verbose Current Dynamic prompt fragment not found');
source = source.replace(promptFrom, promptTo);

fs.writeFileSync(path, source, 'utf8');
console.log('temporary helper repairs, safety tightening, and prompt compaction applied');
