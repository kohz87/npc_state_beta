import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (source.includes(to)) return source;
    if (!source.includes(from)) throw new Error('Missing v0.4.18 relationship-evaluation marker: ' + label);
    return source.replace(from, to);
}

{
    const path = 'v03/scanner.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        "            relationshipChange: { impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: '' },",
        "            relationshipChange: { evaluated: true, impact: 'none|ordinary|meaningful|major|extreme', delta: { trust: 0, affection: 0, desire: 0, tension: 0 }, evidence: '', reason: 'required even when impact is none' },",
        'recovery scanner contract',
    );

    source = replaceRequired(
        source,
        "        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',",
        "        '- A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for EVERY exchange-active existing NPC so relationship evaluation is explicit, plus any other individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',",
        'recovery active-NPC patch requirement',
    );

    source = replaceRequired(
        source,
        "        '- Only propose a relationshipChange when the current exchange contains concrete evidence. If unsure, use impact none and zero deltas.',",
        "        '- RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. Most ordinary interactions may correctly produce no movement; for that case use impact none, all-zero deltas, empty evidence, and a concise reason explaining why no player-relationship shift is warranted. Never omit relationshipChange for an exchange-active NPC.',\n        '- Use a non-none relationshipChange only when the current exchange contains concrete evidence. If unsure whether movement is warranted, evaluate it explicitly as impact none rather than omitting the channel.',",
        'recovery relationship evaluation rule',
    );

    const helper = `function relationshipEvaluationDiagnostic(npc, patch, options = {}) {\n    const raw = patch?.relationshipChange && typeof patch.relationshipChange === 'object' && !Array.isArray(patch.relationshipChange)\n        ? patch.relationshipChange\n        : null;\n    const zero = { trust: 0, affection: 0, desire: 0, tension: 0 };\n    if (!raw) {\n        return relationshipDiagnostic(npc, npc, {\n            impact: 'none', delta: zero, evidence: '',\n            reason: 'Scanner omitted relationship evaluation for an exchange-active NPC.',\n        }, options, ['evaluation-missing']);\n    }\n    const rawImpactText = String(raw.impact || '').trim();\n    const impactValid = IMPACTS.has(rawImpactText);\n    const rawImpact = impactValid ? rawImpactText : 'none';\n    const rawDelta = raw.delta && typeof raw.delta === 'object' && !Array.isArray(raw.delta) ? raw.delta : {};\n    const hasRawDelta = RELATIONSHIP_AXES.some(axis => Number(rawDelta?.[axis]) !== 0);\n    const evaluated = raw.evaluated === true;\n    const reason = String(raw.reason || '').trim().slice(0, 800);\n    const evidence = String(raw.evidence || '').trim().slice(0, 800);\n    if (evaluated && impactValid && rawImpact === 'none' && !hasRawDelta && reason) {\n        return relationshipDiagnostic(npc, npc, { impact: 'none', delta: zero, evidence: '', reason }, options, ['evaluated-no-change']);\n    }\n    const diagnosticReason = evaluated\n        ? (reason || 'Scanner returned an incomplete relationship evaluation.')\n        : 'Scanner omitted the required relationshipChange.evaluated flag for an exchange-active NPC.';\n    return relationshipDiagnostic(npc, npc, { impact: rawImpact, delta: zero, evidence, reason: diagnosticReason }, options, [evaluated ? 'evaluation-invalid' : 'evaluation-missing']);\n}\n\n`;

    source = replaceRequired(
        source,
        "function applyRelationshipChange(npc, patch, options = {}) {\n    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;\n    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return npc;",
        helper + "function applyRelationshipChange(npc, patch, options = {}) {\n    const caps = options.relationshipCaps || DEFAULT_RELATIONSHIP_CAPS;\n    const change = relationshipDeltaForPatch(patch, caps);\n    if (change.impact === 'none') return relationshipEvaluationDiagnostic(npc, patch, options);",
        'relationship no-change diagnostic path',
    );

    source = replaceRequired(
        source,
        "        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state\n            // continuity, but never stable profile, memories, or relationship progression.\n            npc = applyLivePatch(npc, patch);\n            npc = applyLifeState(npc, patch, options);\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        }\n        if (exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;",
        "        } else if (patch && worldSet.has(npc.id)) {\n            // Off-screen activity may update current whereabouts/status and explicit life-state\n            // continuity, but never stable profile, memories, or relationship progression.\n            npc = applyLivePatch(npc, patch);\n            npc = applyLifeState(npc, patch, options);\n            npc.updatedAt = Math.max(Date.now(), Number(npc.updatedAt || 0) + 1);\n        }\n        if (applyRelationship && exchangeSet.has(npc.id) && !patch) {\n            npc = relationshipEvaluationDiagnostic(npc, null, { sourceMessageId, turn });\n        }\n        if (exchangeSet.has(npc.id)) npc.lastInteractionMessageId = sourceMessageId;",
        'missing active-NPC evaluation telemetry',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/injection.js';
    let source = fs.readFileSync(path, 'utf8');

    source = replaceRequired(
        source,
        "        'A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',",
        "        'A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for EVERY exchange-active existing NPC so relationship evaluation is explicit, plus any other individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',",
        'foreground active-NPC patch requirement',
    );

    source = replaceRequired(
        source,
        "        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',",
        "        'RELATIONSHIP EVALUATION IS REQUIRED for every NPC in exchangeActiveNpcIds. Return an npcs patch for each such NPC even when no other dossier field changed. Set relationshipChange.evaluated to true. Most ordinary interactions may correctly produce no movement; for that case use impact none, all-zero deltas, empty evidence, and a concise reason explaining why no player-relationship shift is warranted. Never omit relationshipChange for an exchange-active NPC.',\n        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak, but zero must still be reported as an explicit evaluation.',",
        'foreground relationship evaluation rule',
    );

    source = replaceRequired(
        source,
        '\"relationshipChange\":{\"impact\":\"none|ordinary|meaningful|major|extreme\",\"delta\":{\"trust\":0,\"affection\":0,\"desire\":0,\"tension\":0},\"evidence\":\"\",\"reason\":\"\"}',
        '\"relationshipChange\":{\"evaluated\":true,\"impact\":\"none|ordinary|meaningful|major|extreme\",\"delta\":{\"trust\":0,\"affection\":0,\"desire\":0,\"tension\":0},\"evidence\":\"\",\"reason\":\"required even when impact is none\"}',
        'foreground JSON contract',
    );

    fs.writeFileSync(path, source);
}

{
    const path = 'v03/dossier-view.js';
    let source = fs.readFileSync(path, 'utf8');
    source = replaceRequired(
        source,
        "        const unlocks = (event.unlocks || []).map(entry => entry.axis + ' ' + signed(entry.polarity * entry.threshold) + ' unlocked').join(', ');\n        return '<li><b>' + escapeHtml(event.impact + ' — ' + event.reasons.join(', ')) + '</b><p>' + escapeHtml(changes)\n            + (unlocks ? '<br>' + escapeHtml(unlocks) : '') + '</p><small>' + escapeHtml(event.reason || event.evidence) + '</small></li>';",
        "        const unlocks = (event.unlocks || []).map(entry => entry.axis + ' ' + signed(entry.polarity * entry.threshold) + ' unlocked').join(', ');\n        const detail = changes || (event.reasons || []).includes('evaluated-no-change')\n            ? (changes || 'Evaluated; no relationship movement warranted.')\n            : ((event.reasons || []).includes('evaluation-missing')\n                ? 'Required relationship evaluation was omitted by the scanner.'\n                : ((event.reasons || []).includes('evaluation-invalid') ? 'Scanner returned an invalid relationship evaluation.' : 'No score change.'));\n        return '<li><b>' + escapeHtml(event.impact + ' — ' + event.reasons.join(', ')) + '</b><p>' + escapeHtml(detail)\n            + (unlocks ? '<br>' + escapeHtml(unlocks) : '') + '</p><small>' + escapeHtml(event.reason || event.evidence) + '</small></li>';",
        'diagnostic evaluation detail',
    );
    source = replaceRequired(
        source,
        "return '<details><summary>Gate status and recent scoring attempts</summary><ul>' + axes + '</ul>'",
        "return '<details><summary>Gate status and recent relationship evaluations</summary><ul>' + axes + '</ul>'",
        'diagnostic summary label',
    );
    source = replaceRequired(
        source,
        "${block('Relationship scoring', relationshipDiagnosticsHtml(npc), 'npc-state-v3-block-wide')}",
        "${block('Relationship evaluation & scoring', relationshipDiagnosticsHtml(npc), 'npc-state-v3-block-wide')}",
        'diagnostic block title',
    );
    fs.writeFileSync(path, source);
}

console.log('Applied NPC State 0.4.18 explicit relationship evaluation observability');
