import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist', { recursive: true });
execFileSync('zip', ['-qr', 'dist/npc-state-workspace.zip', '.', '-x', '.git/*', 'dist/*'], { stdio: 'inherit' });
console.log('Temporary feature-branch workspace export created.');
