import fs from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const suites = fs.readdirSync(new URL('./', import.meta.url)).filter(name => /^verify.*\.mjs$/.test(name) && name !== 'verify-all.mjs').sort();
let failed = 0;
let failureLog = '';
for (const name of suites) {
    const result = spawnSync(process.execPath, ['beta/' + name], { cwd: root, encoding: 'utf8', timeout: 60000 });
    if (result.status !== 0) {
        failed++;
        const detail = 'FAIL ' + name + '\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\n' : '');
        failureLog += detail + '\n';
        process.stderr.write(detail);
    } else process.stdout.write('PASS ' + name + '\n');
}
console.log(`${suites.length - failed}/${suites.length} verifier suites passed`);
if (failed) {
    if (process.env.GITHUB_ACTIONS === 'true') {
        try {
            fs.writeFileSync('beta/v0430-test-log.txt', failureLog);
            execSync('git config user.name "github-actions[bot]"');
            execSync('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
            execSync('git add beta/v0430-test-log.txt');
            execSync('git commit -m "Capture v0.4.30 verifier failures"');
            execSync('git push');
        } catch (error) {
            process.stderr.write('Could not persist verifier failure log: ' + (error?.message || error) + '\n');
        }
    }
    process.exitCode = 1;
}
