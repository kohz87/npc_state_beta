import fs from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';

const phase = 'beta/phase61-safe-rebase-relationship-modes-0.4.29.mjs';
const result = spawnSync(process.execPath, [phase], { encoding: 'utf8' });
if (result.status !== 0) {
    const text = [result.stdout || '', result.stderr || '', result.error?.message || ''].filter(Boolean).join('\n');
    fs.writeFileSync('beta/phase61-transform-error.txt', text || 'phase61 failed without output');
    try {
        execSync('git config user.name "github-actions[bot]" && git config user.email "41898282+github-actions[bot]@users.noreply.github.com" && git add beta/phase61-transform-error.txt && git commit -m "Record standalone phase61 transform error" && git push', { stdio: 'ignore' });
    } catch {}
    process.stderr.write(text + '\n');
    process.exit(result.status || 1);
}
process.stdout.write(result.stdout || '');
console.log('Preflighted standalone phase61 transform successfully');
