import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const workflow = fs.readFileSync('.github/workflows/seed-beta.yml', 'utf8');
const uiSource = fs.readFileSync('v03/ui.js', 'utf8');
const dossierSource = fs.readFileSync('v03/dossier-view.js', 'utf8');
const styleSource = fs.readFileSync('v03/style.css', 'utf8');
const readme = fs.readFileSync('README.md', 'utf8');
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert(/^0\.4\.(?:3[8-9]|[4-9]\d+)$/.test(manifest.version), 'Manifest must be v0.4.38+');
assert(/name: Build NPC State 0\.4\.(?:3[8-9]|[4-9]\d+) Beta/.test(workflow), 'Workflow title must be v0.4.38+');
assert(/for patch in \$\(seq 2 (?:3[8-9]|[4-9]\d+)\); do/.test(workflow), 'Cold replay must include patch 38 or later');
assert(workflow.includes("# node beta/bump-0.4.38.mjs ; -name 'phase*-0.4.38.mjs'"), 'Workflow must retain v0.4.38 source-parity marker');
for (const path of [
    'beta/bump-0.4.38.mjs',
    'beta/phase78-dossier-rendering-performance-0.4.38.mjs',
    'beta/phase78b-legacy-v0437-release-verifier-compat-0.4.38.mjs',
    'beta/verify-phase78-dossier-rendering-performance-0.4.38.mjs',
    'beta/verify-phase79-release-source-parity-0.4.38.mjs',
]) assert(fs.existsSync(path), 'Missing v0.4.38 source-owned file: ' + path);

assert(uiSource.includes('hydrateVisibleCastPortraits'), 'Generated runtime must retain lazy cast portrait hydration');
assert(uiSource.includes('scheduleLibraryRailRender'), 'Generated runtime must retain coalesced search rendering');
assert(uiSource.includes('detailOnly = false'), 'Generated runtime must retain detail-only rendering path');
assert(dossierSource.includes('deferSource: true'), 'Generated runtime must defer cast portrait sources');
assert(styleSource.includes('backdrop-filter:none'), 'Generated runtime must disable dossier backdrop blur');
assert(!styleSource.includes('backdrop-filter:blur(3px)'), 'Generated runtime must not restore the expensive dossier blur');
assert(readme.includes('## Dossier rendering performance'), 'README must document dossier performance changes');
assert(changelog.includes('## v0.4.38\n'), 'CHANGELOG must contain v0.4.38');

const legacy37 = fs.readFileSync('beta/verify-phase77-release-source-parity-0.4.37.mjs', 'utf8');
assert(legacy37.includes('Manifest must be v0.4.37+'), 'v0.4.37 release verifier must remain descendant-compatible after patch 38');
assert(legacy37.includes('Workflow title must be v0.4.37+'), 'v0.4.37 workflow verifier must remain descendant-compatible after patch 38');
assert(legacy37.includes('Cold replay must include patch 37 or later'), 'v0.4.37 cold-replay verifier must remain descendant-compatible after patch 38');

console.log('PASS v0.4.38 release source parity');