import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('settings UI derives its release label from NPC_STATE_VERSION', () => {
    const ui = read('src/ui.js');
    assert.ok(ui.includes('NPC_STATE_VERSION'));
    assert.ok(ui.includes('${NPC_STATE_VERSION}'));
    assert.equal(ui.includes('0.4.44'), false);
});

test('release labels have one runtime authority and no replacement facade', () => {
    const schema = read('src/schema.js');
    const manifest = JSON.parse(read('manifest.json'));
    assert.ok(schema.includes(`NPC_STATE_VERSION = '${manifest.version}'`));
    assert.equal(fs.existsSync(path.join(root, 'src/schema-core.js')), false);
    assert.doesNotMatch(read('src/scanner.js'), /replaceAll/);
    for (const file of ['src/scan-prompts.js', 'src/engine.js', 'bootstrap.js']) {
        assert.doesNotMatch(read(file), /0\.4\.44|0\.5\.10/);
    }
});
