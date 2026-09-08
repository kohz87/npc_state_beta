import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('release prompt measurement matrix', () => {
    const result = spawnSync(process.execPath, ['scripts/measure-scan-prompts.mjs'], { encoding: 'utf8' });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    assert.equal(result.status, 0);
});
