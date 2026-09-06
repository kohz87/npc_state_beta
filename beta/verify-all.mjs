import fs from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
// PHASE61_CI_TEST_DIAGNOSTIC
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = fs.readdirSync(new URL('./', import.meta.url)).filter(name => /^verify.*\.mjs$/.test(name) && name !== 'verify-all.mjs').sort();
let failed = 0;
let phase61Diagnostic = '';
for (const name of suites) {
    const result = spawnSync(process.execPath, ['beta/' + name], { cwd: root, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) {
        failed++;
        const failureText = 'FAIL ' + name + '\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\n' : '');
        phase61Diagnostic += failureText + '\n';
        process.stderr.write(failureText);
    } else process.stdout.write('PASS ' + name + '\n');
}
console.log(`${suites.length - failed}/${suites.length} verifier suites passed`);
if (failed) {
    try {
        fs.writeFileSync(new URL('./phase61-ci-error.txt', import.meta.url), phase61Diagnostic);
        execSync('git config user.name \"github-actions[bot]\" && git config user.email \"41898282+github-actions[bot]@users.noreply.github.com\" && git add beta/phase61-ci-error.txt && git commit -m \"Record phase61 test diagnostic\" && git push', { cwd: root, stdio: 'ignore' });
    } catch {}
    process.exitCode = 1;
}
