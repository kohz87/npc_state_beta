import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = fs.readdirSync(new URL('./', import.meta.url)).filter(name => /^verify.*\.mjs$/.test(name) && name !== 'verify-all.mjs').sort();
let failed = 0;
for (const name of suites) {
    const result = spawnSync(process.execPath, ['beta/' + name], { cwd: root, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) {
        failed++;
        process.stderr.write('FAIL ' + name + '\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\n' : ''));
    } else process.stdout.write('PASS ' + name + '\n');
}
console.log(`${suites.length - failed}/${suites.length} verifier suites passed`);
if (failed) process.exitCode = 1;
