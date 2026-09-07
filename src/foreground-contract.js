import { dossierFirstPassLiveFieldList } from './model/dossier-fields.js';
import { NPC_STATE_VERSION, normalizeNpcAdmissionMode } from './schema.js';
import { dossierExtractionPromptRules } from './scan-helpers.js';
import { scanOutputContract } from './scan-contract.js';

export const FOREGROUND_CONTRACT_VERSION = 6;

function compact(value, max) {
    const source = String(value || '').replace(/\s+/g, ' ').trim();
    return source.length <= max ? source : source.slice(0, max - 1).trimEnd() + '\u2026';
}

function admissionRule(mode) {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'Admission=manual: no NEW dossiers; existing may update.';
    if (policy === 'named_preferred') return 'Admission=named_preferred: NEW requires an individually relevant proper name, identityKind="named".';
    return 'Admission=balanced: individually relevant named or uniquely identified unnamed NPCs only.';
}

export function foregroundContract(settings = {}, { capture = true } = {}) {
    if (!capture) return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTINUITY]`,
        'Private continuity. Preserve supplied identity, appearance, profile, relationships and current state; omission is not deletion.',
    ].join('\n');
    return [
        `[NPC STATE v${NPC_STATE_VERSION} | FOREGROUND CONTRACT v${FOREGROUND_CONTRACT_VERSION}]`,
        'Visible roleplay first, then one private <npc_state_v1>{JSON}</npc_state_v1> before Inventory. No fences/commentary.',
        admissionRule(settings.newNpcAdmissionMode),
        ...dossierExtractionPromptRules(),
        scanOutputContract(),
        'ACTIVITY: exchangeActive=acted/affected; inChat=participating at end; worldActive=off-screen. Mentions/crowds excluded. Active NPCs need patches. PLAYER excluded from NPC graph.',
        'ONE DOSSIER UPDATE PIPELINE: EXISTING ordinary changes use semanticUpdates only (establish|refine|replace|remove). Collections target ref/expected; [] never clears without grounded clear:true.',
        'PROFILE: temporary states/gestures are not durable traits/habits. Replace grounded obsolete placeholders. Scope form traits. age differs from apparentAge; replacing age needs ageKind birthday|elapsed|correction.',
        `FIRST-PASS LIVE STATE: ${dossierFirstPassLiveFieldList()}|currentForm compare supplied values; remove only if ended. status=condition/activity.`,
        'EVIDENCE: World_State:location/status; NPC_Inner_Chatter:mood/goal; otherwise visible narrative. Reference blocks never prove admission/activity/relationship events. Preserve locks/unrelated values; no replay.',
    ].join('\n');
}

export function optionalForegroundRubrics(settings = {}) {
    const rows = [];
    const relationship = compact(settings.relationshipCriteria, 420);
    const memory = compact(settings.memoryCriteria, 360);
    if (relationship) rows.push(`Campaign relationship calibration (additive): ${relationship}`);
    if (memory) rows.push(`Important-memory calibration: ${memory}`);
    return rows.join('\n');
}
