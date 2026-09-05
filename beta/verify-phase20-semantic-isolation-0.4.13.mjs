import fs from 'node:fs';
import assert from 'node:assert/strict';
import { applyScanResult, parseScanJson } from '../v03/scanner.js';
import { createEmptyState, normalizeNpc } from '../v03/schema.js';
import { relationshipEvidenceGrounding, relationshipEvidencePolarityConflict } from '../v03/relationship-evidence.js';

function payload(overrides = {}) {
    return {
        exchangeActiveNpcIds: [],
        inChatNpcIds: [],
        worldActiveNpcIds: [],
        npcs: [],
        socialEdges: [],
        ...overrides,
    };
}

function apply(state, patch, context, messageId = 1, extra = {}) {
    return applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'],
        inChatNpcIds: ['npc-mira'],
        npcs: [patch],
    }), {
        sourceMessageId: messageId,
        turn: messageId,
        profileContext: context,
        relationshipContext: context,
        playerName: 'Lucien',
        applyReturnedNpcPatches: true,
        ...extra,
    }).state;
}

// Scanner identity fields must be actual strings, never nested values that stringify truthily.
{
    assert.throws(() => parseScanJson(JSON.stringify(payload({ npcs: [{ id: { value: 'npc-mira' } }] }))), /invalid payload structure or members/i);
    assert.throws(() => parseScanJson(JSON.stringify(payload({ npcs: [{ name: 'Mira', aliases: [{ value: 'M' }] }] }))), /invalid payload structure or members/i);
    assert.doesNotThrow(() => parseScanJson(JSON.stringify(payload({ npcs: [{ id: '', name: 'Mira', aliases: ['M'] }] }))));
}

// Living return must be target-specific and must not mistake "not alive" for positive life evidence.
{
    const archived = createEmptyState('living-return-target');
    archived.npcs = [normalizeNpc({
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'confirmed',
        archived: true, archiveReason: 'deceased', archivedAt: 1,
    })];

    const otherAlive = apply(archived, {
        id: 'npc-mira', name: 'Mira', livingReturn: true, lifeState: 'alive',
        lifeStateCertainty: 'explicit', lifeStateReason: 'Sora is alive.',
    }, 'Sora is alive.', 1);
    assert.equal(otherAlive.npcs[0].archived, true, 'Another NPC living resurrected Mira');
    assert.equal(otherAlive.npcs[0].lifeState, 'dead');

    const negatedAlive = apply(archived, {
        id: 'npc-mira', name: 'Mira', livingReturn: true, lifeState: 'alive',
        lifeStateCertainty: 'explicit', lifeStateReason: 'Mira is not alive.',
    }, 'Mira is not alive.', 2);
    assert.equal(negatedAlive.npcs[0].archived, true, 'Negated alive evidence resurrected Mira');

    const returned = apply(archived, {
        id: 'npc-mira', name: 'Mira', livingReturn: true, lifeState: 'alive',
        lifeStateCertainty: 'explicit', lifeStateReason: 'Mira returned alive.',
    }, 'Mira returned alive.', 3);
    assert.equal(returned.npcs[0].archived, false, 'Target-specific living return was rejected');
    assert.equal(returned.npcs[0].lifeState, 'alive');
}

// Death target binding must preserve possessives and ignore another person's survival.
{
    const base = createEmptyState('death-target-possessive');
    base.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', lifeState: 'alive' })];

    const possessive = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit',
        lifeStateReason: "Lucien killed Mira's attacker.",
    }, "Lucien killed Mira's attacker.", 1);
    assert.equal(possessive.npcs[0].archived, false, 'Possessive owner was mistaken for the death victim');

    const mixed = apply(base, {
        id: 'npc-mira', name: 'Mira', lifeState: 'dead', lifeStateCertainty: 'explicit',
        lifeStateReason: 'Mira died while Sora survived.',
    }, 'Mira died while Sora survived.', 2);
    assert.equal(mixed.npcs[0].archived, true, 'Another NPC surviving cancelled Mira death evidence');
    assert.equal(mixed.npcs[0].lifeState, 'dead');
}

// The nearest named actor owns a directional relationship predicate.
{
    const evidence = 'Mira watches as Sora trusts Lucien completely.';
    assert.equal(relationshipEvidenceGrounding(evidence, evidence, {
        subjectNames: ['Mira'], objectNames: ['Lucien'], otherSubjectNames: ['Sora'],
    }), 'wrong-direction');

    const state = createEmptyState('relationship-nearest-actor');
    state.npcs = [
        normalizeNpc({ id: 'npc-mira', name: 'Mira', relationship: { trust: 10 } }),
        normalizeNpc({ id: 'npc-sora', name: 'Sora' }),
    ];
    const next = applyScanResult(state, payload({
        exchangeActiveNpcIds: ['npc-mira'], inChatNpcIds: ['npc-mira'],
        npcs: [{ id: 'npc-mira', name: 'Mira', relationshipChange: {
            impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            evidence, reason: 'Trust deepens.',
        } }],
    }), {
        sourceMessageId: 4, turn: 4, relationshipContext: evidence,
        playerName: 'Lucien', applyReturnedNpcPatches: true,
    }).state;
    const mira = next.npcs.find(npc => npc.id === 'npc-mira');
    assert.equal(mira.relationship.trust, 10, 'Sora-to-player trust moved Mira relationship state');
    assert(mira.relationshipDiagnostics.at(-1)?.reasons?.includes('wrong-direction'));
}

// Polarity belongs to the local predicate, not unrelated nearby words.
{
    assert.equal(relationshipEvidencePolarityConflict('Mira feels her tension easing around Lucien.', { tension: -1 }), false);
    assert.equal(relationshipEvidencePolarityConflict('Mira is no longer afraid and trusts Lucien.', { trust: 1 }), false);
    assert.equal(relationshipEvidencePolarityConflict('Mira feels less trusting of Lucien.', { trust: -1 }), false);
    assert.equal(relationshipEvidencePolarityConflict('Mira does not trust Lucien.', { trust: 1 }), true);

    const tensionState = createEmptyState('tension-easing');
    tensionState.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', relationship: { tension: 10 } })];
    const eased = apply(tensionState, {
        id: 'npc-mira', name: 'Mira', relationshipChange: {
            impact: 'meaningful', delta: { trust: 0, affection: 0, desire: 0, tension: -1 },
            evidence: 'Mira feels her tension easing around Lucien.', reason: 'Tension eases.',
        },
    }, 'Mira feels her tension easing around Lucien.', 5);
    assert(eased.npcs[0].relationship.tension < 10, 'Legitimate tension decrease was rejected');
    assert(!eased.npcs[0].relationshipDiagnostics.at(-1)?.reasons?.includes('evidence-polarity'));

    const trustState = createEmptyState('fear-vs-trust');
    trustState.npcs = [normalizeNpc({ id: 'npc-mira', name: 'Mira', relationship: { trust: 10 } })];
    const trusted = apply(trustState, {
        id: 'npc-mira', name: 'Mira', relationshipChange: {
            impact: 'meaningful', delta: { trust: 1, affection: 0, desire: 0, tension: 0 },
            evidence: 'Mira is no longer afraid and trusts Lucien.', reason: 'Trust grows.',
        },
    }, 'Mira is no longer afraid and trusts Lucien.', 6);
    assert(trusted.npcs[0].relationship.trust > 10, 'Unrelated fear negation blocked positive trust');
    assert(!trusted.npcs[0].relationshipDiagnostics.at(-1)?.reasons?.includes('evidence-polarity'));
}

// Structured dossier import must carry the same family-isolation scope as Targeted Refresh.
{
    const engineSource = fs.readFileSync('v03/engine.js', 'utf8');
    const start = engineSource.indexOf("const parsedRaw = await invokeJson(prompt, 'structured-import-' + npc.id);");
    const end = engineSource.indexOf('async function refreshDossier', start);
    assert(start >= 0 && end > start, 'Structured import source window not found');
    const window = engineSource.slice(start, end);
    assert(window.includes('reconcileFamilyGraph: false'), 'Structured import still permits global family reconciliation');
}

// Release builds must persist the compatibility fixtures they actually test.
{
    const phase12 = fs.readFileSync('beta/verify-phase12-relationship-recovery-0.4.7.mjs', 'utf8');
    const phase13 = fs.readFileSync('beta/verify-phase13-milestone-gate-invariants-0.4.8.mjs', 'utf8');
    const phase15 = fs.readFileSync('beta/verify-phase15-force-rebase-0.4.10.mjs', 'utf8');
    const phase16 = fs.readFileSync('beta/verify-phase16-scanner-edge-hardening-0.4.11.mjs', 'utf8');
    assert(phase12.includes('worldActiveNpcIds: []') && phase12.includes('socialEdges: []') && phase12.includes('JSON.stringify({ exchangeActiveNpcIds: []'));
    assert(phase13.includes('Manifest is not a 0.4.8+ descendant'));
    assert(phase15.includes('Manifest is older than the 0.4.10 force-rebase baseline'));
    assert(phase16.includes('invalid payload structure or members') && phase16.includes('Manifest regressed below 0.4.11'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const manifestMatch = String(manifest.version || '').match(/^0\.4\.(\d+)$/);
assert(manifestMatch && Number(manifestMatch[1]) >= 13, 'Manifest regressed below v0.4.13');
console.log('NPC State 0.4.13+ semantic isolation verified');
