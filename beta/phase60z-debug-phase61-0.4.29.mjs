import fs from 'node:fs';

const path = 'beta/phase61-safe-rebase-relationship-modes-0.4.29.mjs';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes("execSync('git config user.name")) {
    source = source.replace("import fs from 'node:fs';\n", "import fs from 'node:fs';\nimport { execSync } from 'node:child_process';\n");
    source = source.replace("function write(path, source) { fs.writeFileSync(path, source); }\n", `function write(path, source) { fs.writeFileSync(path, source); }\nfunction phase61Fail(message) {\n    try {\n        fs.writeFileSync('beta/phase61-ci-error.txt', String(message) + '\\n');\n        execSync('git config user.name \\\"github-actions[bot]\\\" && git config user.email \\\"41898282+github-actions[bot]@users.noreply.github.com\\\" && git add beta/phase61-ci-error.txt && git commit -m \\\"Record phase61 transform diagnostic\\\" && git push', { stdio: 'ignore' });\n    } catch {}\n    throw new Error(message);\n}\n`);
    source = source.replace("throw new Error('Missing phase61 anchor: ' + label);", "phase61Fail('Missing phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Ambiguous phase61 anchor: ' + label);", "phase61Fail('Ambiguous phase61 anchor: ' + label);");
    source = source.replace("throw new Error('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);", "phase61Fail('Expected one phase61 regex anchor for ' + label + ', found ' + matches.length);");
    fs.writeFileSync(path, source);
}
console.log('Installed temporary phase61 CI diagnostic hook');
