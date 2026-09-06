import fs from 'node:fs';

const path = 'beta/verify-phase64-rebase-state-boundary-hardening-0.4.31.mjs';
let source = fs.readFileSync(path, 'utf8');
const from = `            if (failUploads > 0) {\n                failUploads -= 1;\n                throw new Error('synthetic sidecar upload failure');\n            }`;
const to = `            if (failUploads > 0) {\n                failUploads -= 1;\n                // Use a non-transient response so this test exercises the engine's\n                // fail-closed state publication without spending time in storage retries.\n                return response(400, 'synthetic sidecar upload failure');\n            }`;
if (!source.includes(to)) {
    if (!source.includes(from)) throw new Error('Missing v0.4.31 persistence-failure fixture marker');
    source = source.replace(from, to);
    fs.writeFileSync(path, source);
}
console.log('Aligned v0.4.31 persistence-failure regression with non-transient storage failure');
