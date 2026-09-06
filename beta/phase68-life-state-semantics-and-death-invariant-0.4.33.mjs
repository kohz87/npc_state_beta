import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function requireReplace(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.33 life-state marker: ' + label);
    return source.replace(from, to);
}

// Schema: one death transition invariant, bounded life-state diagnostics, and defensive
// normalization of legacy dead-but-unarchived dossiers.
{
    const path = 'v03/schema.js';
    let source = read(path);

    if (!source.includes('export function normalizeLifeStateDiagnostics(value = [])')) {
        const marker = `function normalizeMilestonePolarity(value) {`;
        const addition = `export function normalizeLifeStateDiagnostics(value = []) {\n    return (Array.isArray(value) ? value : []).slice(-12).map(raw => ({\n        proposedState: ['alive', 'dead', 'unknown'].includes(String(raw?.proposedState || '').trim().toLocaleLowerCase())\n            ? String(raw.proposedState).trim().toLocaleLowerCase()\n            : '',\n        certainty: text(raw?.certainty, 80),\n        evidence: text(raw?.evidence, 1200),\n        code: text(raw?.code, 80),\n        detail: text(raw?.detail, 500),\n        livingReturn: raw?.livingReturn === true,\n        sourceMessageId: Number.isInteger(raw?.sourceMessageId) ? raw.sourceMessageId : null,\n        turn: Number.isInteger(raw?.turn) ? raw.turn : null,\n        at: Number(raw?.at) || null,\n    })).filter(item => item.code);\n}\n\n`;
        if (!source.includes(marker)) throw new Error('Missing life-state diagnostic insertion marker');
        source = source.replace(marker, addition + marker);
    }

    if (!source.includes('export function applyConfirmedDeathTransition(input = {}, options = {})')) {
        const marker = `export function normalizeNpc(input = {}, options = {}) {`;
        const addition = `export function applyConfirmedDeathTransition(input = {}, options = {}) {\n    const next = structuredClone(input && typeof input === 'object' ? input : {});\n    const alreadyDeceased = String(next.lifeState || '').trim().toLocaleLowerCase() === 'dead'\n        || (next.archived === true && String(next.archiveReason || '').trim().toLocaleLowerCase() === 'deceased');\n    const at = Number(options.at) || Date.now();\n    next.lifeState = 'dead';\n    next.lifeStateCertainty = text(options.certainty ?? next.lifeStateCertainty, 80) || 'explicit';\n    next.lifeStateReason = text(options.reason ?? next.lifeStateReason, 500);\n    next.archived = true;\n    next.archiveReason = 'deceased';\n    next.archivedAt = alreadyDeceased && Number(next.archivedAt) ? Number(next.archivedAt) : at;\n    next.present = false;\n    next.worldActive = false;\n    return next;\n}\n\n`;
        if (!source.includes(marker)) throw new Error('Missing confirmed death transition insertion marker');
        source = source.replace(marker, addition + marker);
    }

    source = requireReplace(
        source,
        `    const archiveReason = text(input.archiveReason, 80);\n    const archived = input.archived === true;`,
        `    const lifeState = ['alive', 'dead', 'unknown'].includes(String(input.lifeState)) ? String(input.lifeState) : 'unknown';\n    const confirmedDead = lifeState === 'dead';\n    const archiveReason = confirmedDead ? 'deceased' : text(input.archiveReason, 80);\n    const archived = confirmedDead || input.archived === true;`,
        'normalize dead archival locals',
    );

    source = requireReplace(
        source,
        `        relationshipDiagnostics: normalizeRelationshipDiagnostics(input.relationshipDiagnostics),\n        relationshipMilestones,`,
        `        relationshipDiagnostics: normalizeRelationshipDiagnostics(input.relationshipDiagnostics),\n        lifeStateDiagnostics: normalizeLifeStateDiagnostics(input.lifeStateDiagnostics),\n        relationshipMilestones,`,
        'life-state diagnostics field',
    );

    source = requireReplace(
        source,
        `        lifeState: ['alive', 'dead', 'unknown'].includes(String(input.lifeState)) ? String(input.lifeState) : 'unknown',\n        lifeStateCertainty: text(input.lifeStateCertainty, 80),`,
        `        lifeState,\n        lifeStateCertainty: text(input.lifeStateCertainty, 80),`,
        'normalized life-state local',
    );

    write(path, source);
}

// Scanner: the model owns life-state semantics. Backend validation is provenance/certainty only;
// it no longer tries to understand English death or living-return sentence shapes itself.
{
    const path = 'v03/scanner.js';
    let source = read(path);

    source = requireReplace(
        source,
        `    applyBirthdayFill,\n    applyRelationshipMilestoneCrossings,`,
        `    applyBirthdayFill,\n    applyConfirmedDeathTransition,\n    applyRelationshipMilestoneCrossings,`,
        'scanner confirmed-death import',
    );
    source = requireReplace(
        source,
        `    normalizeKeyRelationshipEntries,\n    normalizeMemoryEntries,`,
        `    normalizeKeyRelationshipEntries,\n    normalizeLifeStateDiagnostics,\n    normalizeMemoryEntries,`,
        'scanner life-state diagnostics import',
    );

    const semanticStart = source.indexOf(`const AFFIRMATIVE_DEATH_CUE = `);
    const semanticEndMarker = `\n\nfunction applyLifeState(npc, patch, options = {}) {`;
    const semanticEnd = source.indexOf(semanticEndMarker, semanticStart);
    if (semanticStart < 0 || semanticEnd < 0) throw new Error('Missing hardcoded life-state semantic parser block');
    const replacement = `function lifeStateEvidenceGrounded(evidence, context) {\n    const proof = String(evidence || '').trim();\n    const source = String(context || '').trim();\n    return Boolean(proof && source && profileEvidenceGrounded(proof, source));\n}\n\nfunction lifeStateCertaintyConfirmed(value) {\n    return ['explicit', 'strong', 'confirmed'].includes(String(value || '').trim().toLocaleLowerCase());\n}\n\nfunction lifeStateDiagnostic(npc, patch, options, code, detail) {\n    const next = structuredClone(npc);\n    next.lifeStateDiagnostics = normalizeLifeStateDiagnostics([...(next.lifeStateDiagnostics || []), {\n        proposedState: String(patch?.lifeState || '').trim().toLocaleLowerCase(),\n        certainty: String(patch?.lifeStateCertainty || '').trim(),\n        evidence: String(patch?.lifeStateReason || '').trim(),\n        code,\n        detail,\n        livingReturn: patch?.livingReturn === true,\n        sourceMessageId: Number.isInteger(options?.sourceMessageId) ? options.sourceMessageId : null,\n        turn: Number.isInteger(options?.turn) ? options.turn : null,\n        at: Date.now(),\n    }]);\n    return next;\n}\n`;
    source = source.slice(0, semanticStart) + replacement + source.slice(semanticEnd);

    const oldApply = `function applyLifeState(npc, patch, options = {}) {\n    const next = structuredClone(npc);\n    const lifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();\n    const certainty = String(patch?.lifeStateCertainty || '').trim();\n    const reason = String(patch?.lifeStateReason || '').trim();\n    const policy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const lifeContext = policy?.detected\n        ? [policy.visibleText, policy.worldStateText].filter(Boolean).join('\\n')\n        : String(options.profileContext || '');\n    const grounded = Boolean(reason && (!lifeContext.trim() || profileEvidenceGrounded(reason, lifeContext)));\n    const deathCue = affirmativeDeathEvidence(npc, reason, lifeContext);\n    const livingReturnCue = affirmativeLivingReturnEvidence(npc, reason, lifeContext);\n    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'\n        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');\n\n    // A dead/archived dossier may return only through the explicit livingReturn channel,\n    // and that channel must point back to visible/world current-continuity evidence.\n    if (patch?.livingReturn === true) {\n        if (!grounded || !livingReturnCue) return next;\n        next.archived = false;\n        next.archiveReason = '';\n        next.archivedAt = null;\n        next.lifeState = 'alive';\n        next.lifeStateCertainty = certainty || 'explicit';\n        next.lifeStateReason = reason;\n        return next;\n    }\n\n    if (lifeState === 'dead') {\n        if (!['explicit', 'confirmed'].includes(certainty.toLocaleLowerCase()) || !grounded || !deathCue) return next;\n        next.lifeState = 'dead';\n        next.lifeStateCertainty = certainty;\n        next.lifeStateReason = reason;\n        next.archived = true;\n        next.archiveReason = 'deceased';\n        next.archivedAt = Date.now();\n        next.present = false;\n        next.worldActive = false;\n        return next;\n    }\n\n    // Merely outputting alive must never resurrect a confirmed dead dossier.\n    if (lifeState === 'alive' && wasDead) return next;\n    if (['alive', 'unknown'].includes(lifeState) && grounded) {\n        next.lifeState = lifeState;\n        next.lifeStateCertainty = certainty;\n        next.lifeStateReason = reason;\n    }\n    return next;\n}`;

    const newApply = `function applyLifeState(npc, patch, options = {}) {\n    const next = structuredClone(npc);\n    const lifeState = String(patch?.lifeState || '').trim().toLocaleLowerCase();\n    const certainty = String(patch?.lifeStateCertainty || '').trim();\n    const reason = String(patch?.lifeStateReason || '').trim();\n    const policy = options.evidencePolicy && typeof options.evidencePolicy === 'object' ? options.evidencePolicy : null;\n    const lifeContext = policy?.detected\n        ? [policy.visibleText, policy.worldStateText].filter(Boolean).join('\\n')\n        : String(options.profileContext || '');\n    const grounded = lifeStateEvidenceGrounded(reason, lifeContext);\n    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'\n        || (npc?.archived === true && String(npc?.archiveReason || '').toLocaleLowerCase() === 'deceased');\n    const reject = (code, detail) => lifeStateDiagnostic(next, patch, options, code, detail);\n\n    // The scanner model owns semantic interpretation. The backend verifies only that its\n    // evidence came from permitted source text and that a death judgment is sufficiently certain.\n    if (patch?.livingReturn === true) {\n        if (!reason) return reject('missing-evidence', 'livingReturn requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'livingReturn evidence was not found in permitted current narrative or World_State text.');\n        next.archived = false;\n        next.archiveReason = '';\n        next.archivedAt = null;\n        next.lifeState = 'alive';\n        next.lifeStateCertainty = certainty || 'explicit';\n        next.lifeStateReason = reason;\n        return next;\n    }\n\n    if (lifeState === 'dead') {\n        if (!reason) return reject('missing-evidence', 'Confirmed death requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Death evidence was not found in permitted current narrative or World_State text.');\n        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'Confirmed death requires lifeStateCertainty explicit or strong.');\n        return applyConfirmedDeathTransition(next, { certainty, reason, at: Date.now() });\n    }\n\n    // Merely outputting alive must never resurrect a confirmed dead dossier.\n    if (lifeState === 'alive' && wasDead) return reject('living-return-required', 'A confirmed-dead dossier can return to alive only through livingReturn with grounded evidence.');\n    if (['alive', 'unknown'].includes(lifeState)) {\n        if (!reason) return reject('missing-evidence', 'Life-state updates require grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Life-state evidence was not found in permitted current narrative or World_State text.');\n        next.lifeState = lifeState;\n        next.lifeStateCertainty = certainty;\n        next.lifeStateReason = reason;\n        return next;\n    }\n    if (lifeState) return reject('unsupported-state', 'Scanner proposed an unsupported lifeState value.');\n    return next;\n}`;

    source = requireReplace(source, oldApply, newApply, 'grounded semantic life-state application');

    source = requireReplace(
        source,
        `        '- Confirmed death requires explicit current-timeline evidence. Ambiguous danger/injury is not death. lifeStateReason must state the concrete evidence and is backend-grounded against visible narrative or World_State.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly alive, surviving, resurrected, or physically returned. It also requires a grounded lifeStateReason; merely outputting lifeState alive never resurrects a confirmed dead dossier.',`,
        `        '- LIFE-STATE SEMANTICS: you are responsible for interpreting attribution, pronouns, indirect reports, negation, hypothetical language, and certainty. The backend validates lifeStateReason against permitted current narrative/World_State source text but does not reinterpret its English wording. Never propose dead from negated, hypothetical, merely dangerous, or uncertain evidence.',\n        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve the concrete source evidence. A confirmed death is archived immediately as deceased.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again. It requires grounded lifeStateReason evidence; merely outputting lifeState alive never resurrects a confirmed dead dossier.',`,
        'life-state semantic prompt ownership',
    );

    write(path, source);
}

// Manual dossier edits are authoritative. An explicit manual lifeState=dead uses the same
// death-transition helper as scanner acceptance instead of relying on independent normalization.
{
    const path = 'v03/engine.js';
    let source = read(path);
    source = requireReplace(
        source,
        `    applyBirthdayFill,\n    findNpcByReference,`,
        `    applyBirthdayFill,\n    applyConfirmedDeathTransition,\n    findNpcByReference,`,
        'engine confirmed-death import',
    );
    source = requireReplace(
        source,
        `            let next = normalizeNpc(nextRaw);`,
        `            const authoritativeManualDeath = Object.prototype.hasOwnProperty.call(patch || {}, 'lifeState')\n                && String(patch.lifeState || '').trim().toLocaleLowerCase() === 'dead';\n            const transitionedRaw = authoritativeManualDeath\n                ? applyConfirmedDeathTransition(nextRaw, {\n                    certainty: String(patch.lifeStateCertainty || '').trim() || 'explicit',\n                    reason: String(patch.lifeStateReason || '').trim() || 'Manual dossier adjustment by player.',\n                    at: Date.now(),\n                })\n                : nextRaw;\n            let next = normalizeNpc(transitionedRaw);`,
        'authoritative manual death transition',
    );
    write(path, source);
}

console.log('Applied NPC State v0.4.33 grounded life-state semantics and confirmed-death invariant');
