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

test('scanner and injection facades derive replacement release labels from NPC_STATE_VERSION', () => {
    for (const file of ['src/scanner.js', 'src/injection.js']) {
        const source = read(file);
        assert.ok(source.includes('NPC_STATE_VERSION'));
        assert.equal(source.includes("replaceAll('v0.4.44', 'v0.5.0')"), false);
    }
});
