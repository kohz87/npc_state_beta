import fs from 'node:fs';

const phasePath = 'beta/phase61-safe-rebase-relationship-modes-0.4.29.mjs';
let source = fs.readFileSync(phasePath, 'utf8');
source = source.replace("(?=    async function withLifecycleKeys)/,", "(?=    return Object.freeze\\(\\{)/,");
if (!source.includes("execSync('git config user.name")) {
    source = source.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nimport { execSync } from 'node:child_process';\n");
    source = source.replace("function write(path, source) { fs.writeFileSync(path, source); }\n", `function write(path, source) { fs.writeFileSync(path, source); }\nfunction phase61Fail(message) {\n    try {\n        fs.writeFileSync('beta/phase61-ci-error.txt', String(message) + '\\n');\n        execSync('git config user.name \\\"github-actions[bot]\\\" && git config user.email \\\"41898282+github-actions[bot]@users.noreply.github.com\\\" && git add beta/phase61-ci-error.txt && git commit -m \\\"Record phase61 transform diagnostic\\\" && git push', { stdio: 'ignore' });\n    } catch {}\n    throw new Error(message);\n}\n`);
    source = source.replace("throw new Error('Missing phase61 anchor: ' + label);", "phase61Fail('Missing phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Ambiguous phase61 anchor: ' + label);", "phase61Fail('Ambiguous phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);", "phase61Fail('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);");
}
fs.writeFileSync(phasePath, source);

const verifyPath = 'beta/verify-all.mjs';
let verify = fs.readFileSync(verifyPath, 'utf8');
if (!verify.includes('PHASE61_CI_TEST_DIAGNOSTIC')) {
    verify = verify.replace("import { spawnSync } from 'node:child_process';", "import { spawnSync, execSync } from 'node:child_process';\n// PHASE61_CI_TEST_DIAGNOSTIC");
    verify = verify.replace("let failed = 0;", "let failed = 0;\nlet phase61Diagnostic = '';");
    verify = verify.replace("failed++;\n        process.stderr.write('FAIL ' + name + '\\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\\n' : ''));", "failed++;\n        const failureText = 'FAIL ' + name + '\\n' + (result.stdout || '') + (result.stderr || '') + (result.error ? result.error.message + '\\n' : '');\n        phase61Diagnostic += failureText + '\\n';\n        process.stderr.write(failureText);");
    verify = verify.replace("if (failed) process.exitCode = 1;", "if (failed) {\n    try {\n        fs.writeFileSync(new URL('./phase61-ci-error.txt', import.meta.url), phase61Diagnostic);\n        execSync('git config user.name \\\"github-actions[bot]\\\" && git config user.email \\\"41898282+github-actions[bot]@users.noreply.github.com\\\" && git add beta/phase61-ci-error.txt && git commit -m \\\"Record phase61 test diagnostic\\\" && git push', { cwd: root, stdio: 'ignore' });\n    } catch {}\n    process.exitCode = 1;\n}");
    fs.writeFileSync(verifyPath, verify);
}

console.log('Installed temporary phase61 CI diagnostics and corrected generated engine anchor');
