import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('checked-in source is authoritative and historical replay machinery is absent', () => {
    assert.equal(fs.existsSync(path.join(root, 'v03')), false);
    assert.equal(fs.existsSync(path.join(root, 'beta')), false);
    assert.equal(fs.existsSync(path.join(root, 'src/index.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src/injection-core.js')), false);
    const workflow = read('.github/workflows/ci.yml');
    assert.doesNotMatch(workflow, /git clone .*npc_state\.git/);
    assert.doesNotMatch(workflow, /git push/);
    assert.match(workflow, /npm run validate/);
    assert.match(workflow, /npm test/);
    assert.match(workflow, /npm run package/);
});

test('extension entry paths stay valid at SillyTavern nesting depth', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.equal(manifest.js, 'bootstrap.js');
    assert.equal(manifest.css, 'src/style.css');
    assert.match(read('bootstrap.js'), /\.\/src\/index\.js/);
    assert.match(read('src/index.js'), /\.\.\/\.\.\/\.\.\/\.\.\/extensions\.js/);
    assert.match(read('src/index.js'), /\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/script\.js/);
});

test('release, persisted schema, model contract, foreground contract, and settings schema remain independent concepts', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const schema = read('src/schema.js');
    const semantic = read('src/model/semantic-updates.js');
    const foreground = read('src/foreground-contract.js');
    const settings = read('src/settings.js');
    assert.equal(manifest.version, '0.7.5');
    assert.match(schema, /NPC_STATE_VERSION = '0\.7\.5'/);
    assert.match(schema, /NPC_STATE_SCHEMA_VERSION = 1/);
    assert.match(semantic, /NPC_STATE_MODEL_CONTRACT_VERSION = 3/);
    assert.match(foreground, /FOREGROUND_CONTRACT_VERSION = 4/);
    assert.equal(fs.existsSync(path.join(root, 'src/foreground-budget.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src/foreground-context.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src/model/dossier-fields.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'src/operation-diagnostics.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'docs/core-contract.md')), true);
    assert.match(settings, /const SETTINGS_SCHEMA = 1/);
});
