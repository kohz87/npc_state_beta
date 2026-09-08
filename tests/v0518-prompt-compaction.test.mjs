import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SCAN_SYSTEM_PROMPT } from '../src/scanner.js';
import { scanOutputExamples } from '../src/scan-contract.js';
import { DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { FOREGROUND_TOKEN_ESTIMATE_METHOD } from '../src/foreground-budget.js';
import { scanPromptMeasurementMatrix } from '../scripts/measure-scan-prompts.mjs';

const matrix = () => new Map(scanPromptMeasurementMatrix().map(row => [row.name, row]));

test('v0.5.20 semantic calibration retains compact routine budgets', () => {
    const rows = matrix();
    // v0.5.20 spends a small bounded amount of prompt budget on positive first-pass
    // sufficiency and exact Current Dynamic evidence binding instead of restoring the
    // pre-compaction prompt or truncating current narrative.
    const ceilings = {
        'minimal-one-npc': 6100,
        'rich-first-encounter': 6100,
        'three-active-plus-mentioned': 7200,
        'observation-development': 6450,
        'dense-collections-locks-forms': 7800,
        'large-db-one-relevant': 6300,
        'structured-plus-custom': 6850,
        'targeted-refresh': 4600,
    };
    for (const [name, ceiling] of Object.entries(ceilings)) {
        assert.ok(rows.has(name), name);
        assert.ok(rows.get(name).estTokens <= ceiling, `${name}: ${rows.get(name).estTokens} > ${ceiling} via ${FOREGROUND_TOKEN_ESTIMATE_METHOD}`);
    }
});

test('v0.5.20 semantic calibration adds only bounded overhead to v0.5.19 fixtures', () => {
    const rows = matrix();
    const v0519 = {
        'minimal-one-npc': 5831,
        'rich-first-encounter': 5834,
        'three-active-plus-mentioned': 6898,
        'observation-development': 6157,
        'dense-collections-locks-forms': 7500,
        'large-db-one-relevant': 6036,
        'structured-plus-custom': 6559,
        'targeted-refresh': 4307,
    };
    for (const [name, before] of Object.entries(v0519)) {
        assert.ok(rows.has(name), name);
        const increase = rows.get(name).estTokens - before;
        assert.ok(increase >= 0 && increase <= 260, `${name}: semantic-calibration overhead +${increase} tokens`);
    }
});


test('compact populated examples account for every field in their declared evaluation groups', () => {
    for (const patch of scanOutputExamples().populated.npcs) {
        const groups = new Set(patch.evaluatedGroups || []);
        const expected = DOSSIER_SEMANTIC_FIELDS.filter(field => groups.has(DOSSIER_FIELD_DEFINITIONS[field]?.group));
        const proposed = new Set((patch.semanticUpdates || []).map(update => update.field));
        for (const field of DOSSIER_SEMANTIC_FIELDS) if (Object.hasOwn(patch, field)) proposed.add(field);
        const evaluated = new Set([...(patch.fieldEvaluations?.unchanged || []), ...(patch.fieldEvaluations?.insufficient || []), ...(patch.fieldEvaluations?.unavailable || [])]);
        for (const field of expected) assert.ok(proposed.has(field) || evaluated.has(field), `${patch.name}:${field}`);
    }
});

test('legitimately long current evidence is preserved rather than truncated to meet the routine target', () => {
    const row = matrix().get('long-current-response');
    assert.ok(row.estTokens > 7500);
    assert.match(row.prompt, /Paragraph 1: Vrena and Ari work through/);
    assert.match(row.prompt, /Paragraph 350: Vrena and Ari work through/);
    assert.match(row.prompt, /CURRENT ASSISTANT MESSAGE \(complete event evidence\)/);
});

test('large unrelated roster does not scale the compact routine request with stored NPC count', () => {
    const rows = matrix();
    const minimal = rows.get('minimal-one-npc');
    const large = rows.get('large-db-one-relevant');
    assert.ok(large.estTokens - minimal.estTokens < 400, `${large.estTokens} vs ${minimal.estTokens}`);
    assert.doesNotMatch(large.prompt, /Offscreen 998/);
    assert.match(large.prompt, /Vrena Tolk/);
});

test('structured authority and user-authored criteria survive compaction verbatim', () => {
    const row = matrix().get('structured-plus-custom');
    assert.match(row.prompt, /Treat formal frontier obligations as weak evidence unless the scene explicitly changes personal reliance\./);
    assert.match(row.prompt, /Keep promises, rescues, durable gifts, major cruelty, and lasting obligations\. Exclude routine paperwork\./);
    assert.match(row.prompt, /World_State/);
    assert.match(row.prompt, /NPC_Inner_Chatter/);
});

test('scanner dispatch and developer measurement share one system wrapper authority', () => {
    const engine = fs.readFileSync(new URL('../src/engine.js', import.meta.url), 'utf8');
    assert.match(engine, /SCAN_SYSTEM_PROMPT/);
    assert.doesNotMatch(engine, /const SYSTEM_PROMPT\s*=/);
    assert.equal(SCAN_SYSTEM_PROMPT, 'Return only valid JSON for the NPC State scanner. Obey the supplied schema and evidence rules exactly.');
});
