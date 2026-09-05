import fs from 'node:fs';

const path = 'beta/verify-phase41-release-source-parity-0.4.20.mjs';
let source = fs.readFileSync(path, 'utf8');

const exactVersion = "assert.equal(manifest.version, '0.4.20', 'Release source is not v0.4.20');";
const descendantVersion = "const manifestPatch = Number(String(manifest.version || '').split('.')[2]);\nassert(String(manifest.version || '').startsWith('0.4.') && Number.isInteger(manifestPatch) && manifestPatch >= 20, 'Release source regressed below v0.4.20');";
if (source.includes(exactVersion)) source = source.replace(exactVersion, descendantVersion);
else if (!source.includes('Release source regressed below v0.4.20')) throw new Error('Missing v0.4.20 manifest parity marker');

const exactWorkflow = "assert(workflow.includes('Build NPC State 0.4.20 Beta'), 'Workflow is not versioned for v0.4.20');";
const descendantWorkflow = "assert(workflow.includes('Build NPC State 0.4.'), 'Workflow lost NPC State 0.4.x versioning');";
if (source.includes(exactWorkflow)) source = source.replace(exactWorkflow, descendantWorkflow);
else if (!source.includes('Workflow lost NPC State 0.4.x versioning')) throw new Error('Missing v0.4.20 workflow parity marker');

fs.writeFileSync(path, source);
console.log('Made v0.4.20 release parity verifier forward-compatible with v0.4.21+');
