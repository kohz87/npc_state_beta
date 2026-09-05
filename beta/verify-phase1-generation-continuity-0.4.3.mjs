import fs from 'node:fs';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { buildInjection, qualitativeRelationshipLens } from '../v03/injection.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const state = createEmptyState('phase1-v043');
const focal = normalizeNpc({
    id: 'npc-astra-phase1',
    name: 'Astra',
    role: 'Companion',
    species: 'Dragon chimera',
    age: '6',
    apparentAge: '~6',
    appearance: 'Small silver-haired girl with gray eyes and a careful posture.',
    personality: 'Soft-spoken, observant, protective of her sister, and quietly analytical.',
    behaviorProfile: ['Disposition: gentle', 'Independence: quietly self-directed'],
    speech: 'Soft, formal, concise.',
    goal: 'Keep pace with Papa while watching Kiri.',
    status: 'Walking beside Papa on the timber road.',
    keyRelationships: ['Kiri - twin sister'],
    memories: ['Papa taught her how to read tracks in the snow.'],
    relationship: { trust: 53, affection: 51, desire: 8, tension: -4 },
    relationshipSummary: 'Trusts Papa and is warmly attached while retaining her own judgment.',
    present: true,
    importance: 90,
});
state.npcs.push(focal);
state.lastObservation = { exchangeActiveNpcIds: [focal.id], finalPresentNpcIds: [focal.id], worldActiveNpcIds: [] };
for (let i = 0; i < 220; i += 1) state.npcs.push(normalizeNpc({
    id: 'npc-directory-' + i,
    name: 'Background Known NPC ' + i,
    role: 'Historical contact ' + i,
    archived: i % 3 === 0,
    importance: 1,
}));

const lens = qualitativeRelationshipLens(focal);
assert(lens.includes('Trust: established confidence/reliance'), 'Trust qualitative band missing');
assert(lens.includes('Affection: established warmth/attachment'), 'Affection qualitative band missing');
assert(!/\b53\b|\b51\b|\b8\b|\b-4\b/.test(lens), 'Qualitative lens leaked exact relationship scores');

const injection = buildInjection(state, {
    enabled: true,
    autoScan: true,
    inject: true,
    injectLimit: 6,
    injectBudgetTokens: 1800,
    newNpcHistoryEnrichment: true,
    foregroundNewNpcHistory: 'Older visible context that may help a genuinely new NPC.',
});
assert(/\[NPC STATE v0\.4\.(?:[3-9]|[1-9]\d+) BETA \| FOREGROUND CONTINUITY\]/.test(injection), '0.4.x descendant injection header missing');
assert(injection.includes('NPC npc-astra-phase1 | Astra | Companion'), 'Focal In-chat dossier was starved by directory budget');
assert(injection.includes('Personality: Soft-spoken, observant, protective of her sister'), 'Core focal personality did not survive reserved dossier budget');
assert(injection.includes('Player relationship lens:'), 'Qualitative relationship lens not injected');
assert(!injection.includes('Relationship toward PLAYER: trust 53'), 'Legacy raw relationship line remains in generation injection');
assert(!injection.includes('trust 53, affection 51'), 'Exact relationship numbers leaked through continuity text');
assert(injection.includes('KNOWN NPC DIRECTORY'), 'Identity directory disappeared entirely');
assert(injection.includes('RECENT VISIBLE HISTORY FOR NEW-NPC ENRICHMENT ONLY'), 'History enrichment disappeared under new budget allocator');

const source = fs.readFileSync(new URL('../v03/injection.js', import.meta.url), 'utf8');
assert(source.includes('const dossierBudget = Math.max(0, Math.floor(maxChars * 0.68))'), 'Dossier reservation ratio missing');
assert(source.includes('const directoryBudget = Math.max(0, Math.min(Math.floor(maxChars * 0.20)'), 'Directory cap missing');
assert(source.includes('never infer or echo hidden numeric meter values'), 'Qualitative relationship anti-echo rule missing');

console.log('NPC State 0.4.3 Phase 1 generation continuity verification passed');
