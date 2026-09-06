import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function requireReplace(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.33 life-state binding marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/scanner.js';
    let source = read(path);

    source = requireReplace(
        source,
        `function lifeStateEvidenceGrounded(evidence, context) {\n    const proof = String(evidence || '').trim();\n    const source = String(context || '').trim();\n    return Boolean(proof && source && profileEvidenceGrounded(proof, source));\n}\n\nfunction lifeStateCertaintyConfirmed(value) {`,
        `function lifeStateEvidenceGrounded(evidence, context) {\n    const proof = evidenceTextKey(evidence, 1600);\n    const source = evidenceTextKey(context, 30000);\n    // Life-state changes are high-impact continuity transitions. Unlike ordinary profile\n    // refinement, their evidence provenance must be source-span grounded rather than\n    // accepted by the broader fuzzy profile matcher. Semantic meaning remains model-owned.\n    return Boolean(proof && source && source.includes(proof));\n}\n\nfunction lifeStateEvidenceTargetsNpc(state, npc, evidence) {\n    const proof = String(evidence || '').trim();\n    if (!proof) return false;\n    const variants = [npc?.name, ...(Array.isArray(npc?.aliases) ? npc.aliases : [])]\n        .map(value => String(value || '').trim()).filter(Boolean);\n    if (variants.some(value => containsNormalizedPhrase(proof, value))) return true;\n    // Multi-token canonical names may be referred to by a unique short identity already\n    // accepted by the general presence system. This is identity binding only; it does not\n    // infer death, survival, negation, attribution, or grammatical role.\n    return shortActivityIdentityCandidates(npc).some(candidate =>\n        shortActivityIdentityUnique(state, npc, candidate) && identityTokenMention(proof, candidate));\n}\n\nfunction lifeStateCertaintyConfirmed(value) {`,
        'strict provenance and target identity helper',
    );

    source = requireReplace(
        source,
        `    const grounded = lifeStateEvidenceGrounded(reason, lifeContext);\n    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'`,
        `    const grounded = lifeStateEvidenceGrounded(reason, lifeContext);\n    const targeted = lifeStateEvidenceTargetsNpc(options.state, npc, reason);\n    const wasDead = String(npc?.lifeState || '').toLocaleLowerCase() === 'dead'`,
        'target binding local',
    );

    source = requireReplace(
        source,
        `    if (patch?.livingReturn === true) {\n        if (!reason) return reject('missing-evidence', 'livingReturn requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'livingReturn evidence was not found in permitted current narrative or World_State text.');\n        next.archived = false;`,
        `    if (patch?.livingReturn === true) {\n        if (!reason) return reject('missing-evidence', 'livingReturn requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'livingReturn evidence was not found as a permitted current narrative or World_State source span.');\n        if (!targeted) return reject('target-mismatch', 'livingReturn evidence does not bind this dossier to the cited source span.');\n        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'livingReturn requires lifeStateCertainty explicit or strong.');\n        next.archived = false;`,
        'living return provenance target certainty gate',
    );

    source = requireReplace(
        source,
        `    if (lifeState === 'dead') {\n        if (!reason) return reject('missing-evidence', 'Confirmed death requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Death evidence was not found in permitted current narrative or World_State text.');\n        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'Confirmed death requires lifeStateCertainty explicit or strong.');`,
        `    if (lifeState === 'dead') {\n        if (!reason) return reject('missing-evidence', 'Confirmed death requires grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Death evidence was not found as a permitted current narrative or World_State source span.');\n        if (!targeted) return reject('target-mismatch', 'Death evidence does not bind this dossier to the cited source span.');\n        if (!lifeStateCertaintyConfirmed(certainty)) return reject('insufficient-certainty', 'Confirmed death requires lifeStateCertainty explicit or strong.');`,
        'death provenance target certainty gate',
    );

    source = requireReplace(
        source,
        `    if (['alive', 'unknown'].includes(lifeState)) {\n        if (!reason) return reject('missing-evidence', 'Life-state updates require grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Life-state evidence was not found in permitted current narrative or World_State text.');\n        next.lifeState = lifeState;`,
        `    if (['alive', 'unknown'].includes(lifeState)) {\n        if (!reason) return reject('missing-evidence', 'Life-state updates require grounded lifeStateReason evidence.');\n        if (!grounded) return reject('unverifiable-evidence', 'Life-state evidence was not found as a permitted current narrative or World_State source span.');\n        if (!targeted) return reject('target-mismatch', 'Life-state evidence does not bind this dossier to the cited source span.');\n        next.lifeState = lifeState;`,
        'alive unknown target binding',
    );

    source = source.replaceAll('npc = applyLifeState(npc, patch, options);', 'npc = applyLifeState(npc, patch, { ...options, state });');
    if (!source.includes('npc = applyLifeState(npc, patch, { ...options, state });')) throw new Error('Missing applyLifeState state binding');

    source = requireReplace(
        source,
        `        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve the concrete source evidence. A confirmed death is archived immediately as deceased.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again. It requires grounded lifeStateReason evidence; merely outputting lifeState alive never resurrects a confirmed dead dossier.',`,
        `        '- Confirmed death: set lifeState dead only with grounded current-timeline evidence and lifeStateCertainty explicit or strong. lifeStateReason must quote or closely preserve a concrete permitted source span AND include enough of that span to bind the target NPC by canonical name, established alias, or safe unique short identity. For pronouns, include the nearby antecedent sentence in lifeStateReason. A confirmed death is archived immediately as deceased.',\n        '- livingReturn is true only when a previously archived/dead dossier is explicitly established alive again with lifeStateCertainty explicit or strong. Its grounded lifeStateReason must likewise contain enough source span to bind the target NPC; merely outputting lifeState alive never resurrects a confirmed dead dossier.',`,
        'prompt evidence target contract',
    );

    write(path, source);
}

// Make rejection diagnostics visible in the dossier rather than leaving them as backend-only audit data.
{
    const path = 'v03/dossier-view.js';
    let source = read(path);
    if (!source.includes('function lifeStateDiagnosticsHtml(npc = {})')) {
        const marker = `function relationshipDiagnosticsHtml(npc = {}) {`;
        if (!source.includes(marker)) throw new Error('Missing dossier diagnostic insertion marker');
        const addition = `function lifeStateDiagnosticsHtml(npc = {}) {\n    const rows = (Array.isArray(npc.lifeStateDiagnostics) ? npc.lifeStateDiagnostics : []).slice(-12).reverse();\n    if (!rows.length) return '<p class="npc-state-muted">No rejected life-state updates recorded.</p>';\n    return '<ol class="npc-state-v3-history-list">' + rows.map(event => {\n        const state = String(event?.proposedState || 'life-state update').trim();\n        const certainty = String(event?.certainty || '').trim();\n        const code = String(event?.code || 'rejected').trim();\n        const detail = String(event?.detail || 'Rejected by life-state validation.').trim();\n        const evidence = String(event?.evidence || '').replace(/\\s+/g, ' ').trim();\n        return '<li><div><b>' + escapeHtml(code) + '</b><span>' + escapeHtml(state + (certainty ? ' · ' + certainty : '')) + '</span></div>'\n            + '<p>' + escapeHtml(detail) + '</p>'\n            + (evidence ? '<small>Evidence: ' + escapeHtml(evidence) + '</small>' : '') + '</li>';\n    }).join('') + '</ol>';\n}\n\n`;
        source = source.replace(marker, addition + marker);
    }
    source = requireReplace(
        source,
        `            \${block('Background', paragraphHtml(npc.background), 'npc-state-v3-block-wide')}\n            \${block('Recent relationship changes', relationshipHistoryHtml(npc), 'npc-state-v3-block-wide')}`,
        `            \${block('Background', paragraphHtml(npc.background), 'npc-state-v3-block-wide')}\n            \${block('Life-state diagnostics', lifeStateDiagnosticsHtml(npc), 'npc-state-v3-block-wide')}\n            \${block('Recent relationship changes', relationshipHistoryHtml(npc), 'npc-state-v3-block-wide')}`,
        'dossier life-state diagnostics block',
    );
    write(path, source);
}

console.log('Applied NPC State v0.4.33 strict life-state provenance, target binding, and visible diagnostics');
