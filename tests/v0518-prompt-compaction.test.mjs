import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { SCAN_SYSTEM_PROMPT } from '../src/scanner.js';
import { scanOutputExamples } from '../src/scan-contract.js';
import { DOSSIER_FIELD_DEFINITIONS, DOSSIER_SEMANTIC_FIELDS } from '../src/model/dossier-fields.js';
import { FOREGROUND_TOKEN_ESTIMATE_METHOD } from '../src/foreground-budget.js';
import { scanPromptMeasurementMatrix } from '../scripts/measure-scan-prompts.mjs';

const matrix = () => new Map(scanPromptMeasurementMatrix().map(row => [row.name, row]));

test('v0.5.23 Current Dynamic evidence reuse retains compact routine budgets', () => {
    const rows = matrix();
    // v0.5.23 spends a small bounded prompt increment to explain that already accepted
    // player-facing activity may supply Current Dynamic target binding without making the
    // model repeat the same narrator quote. The dense fixture remains an honest overage.
    const ceilings = {
        'minimal-one-npc': 6400,
        'rich-first-encounter': 6400,
        'three-active-plus-mentioned': 7470,
        'observation-development': 6730,
        'dense-collections-locks-forms': 8075,
        'large-db-one-relevant': 6610,
        'structured-plus-custom': 7135,
        'targeted-refresh': 4800,
    };
    for (const [name, ceiling] of Object.entries(ceilings)) {
        assert.ok(rows.has(name), name);
        assert.ok(rows.get(name).estTokens <= ceiling, `${name}: ${rows.get(name).estTokens} > ${ceiling} via ${FOREGROUND_TOKEN_ESTIMATE_METHOD}`);
    }
});

test('v0.5.23 evidence-reuse contract adds only bounded overhead to v0.5.22 fixtures', () => {
    const rows = matrix();
    const v0522 = {
        'minimal-one-npc': 6343,
        'rich-first-encounter': 6346,
        'three-active-plus-mentioned': 7411,
        'observation-development': 6670,
        'dense-collections-locks-forms': 8012,
        'large-db-one-relevant': 6548,
        'structured-plus-custom': 7071,
        'targeted-refresh': 4745,
    };
    for (const [name, before] of Object.entries(v0522)) {
        assert.ok(rows.has(name), name);
        const increase = rows.get(name).estTokens - before;
        assert.ok(increase >= 0 && increase <= 60, `${name}: evidence-reuse contract overhead +${increase} tokens`);
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
