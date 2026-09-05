import fs from 'node:fs';

const path = 'beta/verify-phase43-release-source-parity-0.4.21.mjs';
let source = fs.readFileSync(path, 'utf8');

const oldManifest = "assert.equal(manifest.version, '0.4.21', 'Release source is not v0.4.21');";
const newManifest = "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 21, 'Release source regressed below v0.4.21');";
if (source.includes(oldManifest)) source = source.replace(oldManifest, newManifest);
else if (!source.includes('Release source regressed below v0.4.21')) throw new Error('Missing v0.4.21 manifest verifier marker');

const oldWorkflow = "assert(workflow.includes('Build NPC State 0.4.21 Beta'), 'Workflow is not versioned for v0.4.21');";
const newWorkflow = "assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');";
if (source.includes(oldWorkflow)) source = source.replace(oldWorkflow, newWorkflow);
else if (!source.includes('Workflow lost NPC State 0.4.x versioning')) throw new Error('Missing v0.4.21 workflow verifier marker');

fs.writeFileSync(path, source);
console.log('Made v0.4.21 release parity verifier forward-compatible with v0.4.22+');
