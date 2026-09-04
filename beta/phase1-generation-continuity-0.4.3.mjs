import fs from 'node:fs';

const path = 'v03/injection.js';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(from, to, label) {
    if (!source.includes(from)) throw new Error('Missing Phase 1 marker: ' + label);
    source = source.replace(from, to);
}

replaceRequired(
`function fullNpc(npc) {
    const rel = npc.relationship || {};
    return [
        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),
        field('Aliases', (npc.aliases || []).join(' | ')),
        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Appearance', npc.appearance), field('Current form', npc.currentForm), field('Known physical forms', appearanceFormsText(npc)), field('Personality', npc.personality),
        field('Behavior', (npc.behaviorProfile || []).join(' | ')), field('Speech', npc.speech),
        field('Mannerisms', (npc.mannerisms || []).join(' | ')), field('Background', npc.background),
        field('Mood', npc.mood), field('Location', npc.location), field('Goal', npc.goal), field('Status', npc.status),
        'Relationship toward PLAYER: trust ' + (Number(rel.trust) || 0) + ', affection ' + (Number(rel.affection) || 0) + ', desire ' + (Number(rel.desire) || 0) + ', tension ' + (Number(rel.tension) || 0),
        field('Relationship summary', npc.relationshipSummary),
        field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),
        field('Important memories', (npc.memories || []).join(' | ')),
    ].filter(Boolean).join('\\n');
}
`,
`function relationshipBand(value, positive, negative) {
    const score = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
    const magnitude = Math.abs(score);
    if (magnitude < 10) return 'little established signal';
    if (magnitude < 30) return score > 0 ? 'slightly ' + positive : 'slightly ' + negative;
    if (magnitude < 70) return score > 0 ? 'established ' + positive : 'established ' + negative;
    if (magnitude < 90) return score > 0 ? 'strong ' + positive : 'strong ' + negative;
    return score > 0 ? 'very deep ' + positive : 'very deep ' + negative;
}

export function qualitativeRelationshipLens(npc = {}) {
    const rel = npc.relationship || {};
    return [
        'Trust: ' + relationshipBand(rel.trust, 'confidence/reliance', 'distrust/wariness'),
        'Affection: ' + relationshipBand(rel.affection, 'warmth/attachment', 'dislike/emotional distance'),
        'Desire: ' + relationshipBand(rel.desire, 'attraction/intimate interest', 'aversion/lack of intimate interest'),
        'Tension: ' + relationshipBand(rel.tension, 'interpersonal strain/charged friction', 'ease/low strain'),
    ].join('; ');
}

function npcContinuityLines(npc) {
    return [
        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),
        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Current form', npc.currentForm), field('Appearance', npc.appearance), field('Current/known forms', appearanceFormsText(npc)),
        field('Personality', npc.personality), field('Behavior', (npc.behaviorProfile || []).join(' | ')), field('Speech', npc.speech),
        field('Goal', npc.goal), field('Status', npc.status), field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),
        'Player relationship lens: ' + qualitativeRelationshipLens(npc),
        field('Relationship summary', npc.relationshipSummary),
        field('Mannerisms', (npc.mannerisms || []).join(' | ')), field('Important memories', (npc.memories || []).join(' | ')),
        field('Mood', npc.mood), field('Location', npc.location), field('Background', npc.background), field('Aliases', (npc.aliases || []).join(' | ')),
    ].filter(Boolean);
}

function fitNpcBlock(npc, maxChars) {
    const lines = npcContinuityLines(npc);
    const out = [];
    let used = 0;
    for (const line of lines) {
        const text = String(line || '').trim();
        if (!text) continue;
        const cost = text.length + (out.length ? 1 : 0);
        if (used + cost > maxChars) continue;
        out.push(text);
        used += cost;
    }
    return out.join('\\n');
}

function buildReservedDossiers(candidates, budgetChars) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length || budgetChars <= 0) return '';
    const blocks = [];
    let remaining = budgetChars;
    for (let i = 0; i < list.length; i += 1) {
        const left = list.length - i;
        const fairShare = Math.max(420, Math.floor(remaining / left));
        const block = fitNpcBlock(list[i], fairShare);
        if (!block) continue;
        const cost = block.length + (blocks.length ? 2 : 0);
        if (cost > remaining) continue;
        blocks.push(block);
        remaining -= cost;
    }
    return blocks.join('\\n\\n');
}
` ,
'qualitative relationship lens and dossier fitter');

replaceRequired(
`    const newNpcHistory = capture && settings.newNpcHistoryEnrichment !== false ? String(settings.foregroundNewNpcHistory || '').trim().slice(0, 4000) : '';
    const directoryRaw = identityDirectory(state);
    const directory = directoryRaw.slice(0, maxChars);
    const remainingChars = Math.max(0, maxChars - directory.length);
    let dossiers = '';
    if (continuity || capture) for (const npc of activeCandidates(state, limit)) {
        const block = '\\n\\n' + fullNpc(npc);
        if ((dossiers + block).length > remainingChars) break;
        dossiers += block;
    }
`,
`    const candidates = (continuity || capture) ? activeCandidates(state, limit) : [];
    // Continuity budgeting is intentionally asymmetric: likely-relevant full dossiers own
    // the majority of the dynamic budget. A giant identity directory can no longer starve
    // the characters who are actually in the active conversation.
    const dossierBudget = Math.max(0, Math.floor(maxChars * 0.68));
    const directoryBudget = Math.max(0, Math.min(Math.floor(maxChars * 0.20), maxChars - dossierBudget));
    const historyBudget = Math.max(0, maxChars - dossierBudget - directoryBudget);
    const newNpcHistory = capture && settings.newNpcHistoryEnrichment !== false
        ? String(settings.foregroundNewNpcHistory || '').trim().slice(0, Math.min(4000, historyBudget))
        : '';
    const directoryRaw = identityDirectory(state);
    const directory = directoryRaw.slice(0, directoryBudget);
    const dossiers = buildReservedDossiers(candidates, dossierBudget);
`,
'reserved injection budgets');

replaceRequired(
`        'RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events are zero. Raw deltas are evidence weights and high established relationships resist further deepening. Desire requires explicit romantic/intimate/physical attraction evidence in the visible CURRENT exchange; friendship, gratitude, rescue, beauty, proximity, trust, and generic affection are not Desire. Do not write a Relationship Summary deeper or more absolute than the accepted relationship state supports.',
`,
`        'RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events are zero. Raw deltas are evidence weights and high established relationships resist further deepening. Desire requires explicit romantic/intimate/physical attraction evidence in the visible CURRENT exchange; friendship, gratitude, rescue, beauty, proximity, trust, and generic affection are not Desire. Do not write a Relationship Summary deeper or more absolute than the accepted relationship state supports. The injected Player relationship lens is deliberately QUALITATIVE; never infer or echo hidden numeric meter values from its wording.',
`,
'qualitative relationship prompt rule');

fs.writeFileSync(path, source);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const line = '- Phase 1 replaces raw player-relationship meter injection with a compact qualitative lens and reserves most dynamic prompt budget for likely-relevant full dossiers. Large identity directories and optional new-NPC history can no longer starve In-chat continuity, while exact numeric relationship values remain private backend state for gates, inertia, and scoring.';
if (!changelog.includes(line)) changelog = changelog.replace('## v0.4.3\n\n', '## v0.4.3\n\n' + line + '\n');
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Applied v0.4.3 Phase 1 generation continuity hardening');
