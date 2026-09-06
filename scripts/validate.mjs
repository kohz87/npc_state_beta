import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

assert.equal(manifest.js, 'bootstrap.js', 'manifest bootstrap path changed unexpectedly');
assert.equal(manifest.css, 'src/style.css', 'manifest CSS must point at authoritative source');
assert.ok(fs.existsSync(path.join(root, manifest.js)), 'manifest JS target is missing');
assert.ok(fs.existsSync(path.join(root, manifest.css)), 'manifest CSS target is missing');
assert.ok(!fs.existsSync(path.join(root, 'v03')), 'historical v03 runtime must not be active source');
assert.ok(!fs.existsSync(path.join(root, 'beta')), 'patch-replay build machinery must be retired');

const schema = read('src/schema.js');
const version = schema.match(/export const NPC_STATE_VERSION = '([^']+)'/)?.[1];
assert.equal(version, manifest.version, 'manifest and runtime release versions diverged');
assert.match(read('bootstrap.js'), /\.\/src\/index\.js/, 'bootstrap must load authoritative src entrypoint');
assert.match(read('src/index.js'), /from '\.\.\/\.\.\/\.\.\/\.\.\/extensions\.js'/, 'SillyTavern nested extension import depth changed');
assert.match(read('src/index.js'), /from '\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/script\.js'/, 'SillyTavern script import depth changed');

const sourceFiles = [];
for (const directory of ['src', 'tests', 'scripts']) {
    const walk = current => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) walk(absolute);
            else if (/\.(?:js|mjs)$/.test(entry.name)) sourceFiles.push(absolute);
        }
    };
    walk(path.join(root, directory));
}
sourceFiles.push(path.join(root, 'bootstrap.js'));

for (const file of sourceFiles.sort()) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) {
        process.stderr.write(result.stdout || '');
        process.stderr.write(result.stderr || '');
        throw new Error(`Syntax check failed: ${path.relative(root, file)}`);
    }
}

console.log(`Validated ${sourceFiles.length} JavaScript files for NPC State ${manifest.version}.`);
