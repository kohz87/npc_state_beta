import fs from 'node:fs';

const path = 'CHANGELOG.md';
let source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('## v0.4.3');
if (start < 0) throw new Error('Missing v0.4.3 changelog section for 0.4.4 dedupe');
const next = source.indexOf('\n## ', start + '## v0.4.3'.length);
const end = next < 0 ? source.length : next;
const before = source.slice(0, start);
const section = source.slice(start, end);
const after = source.slice(end);
const prefix = '- Adds optional passive Birthday continuity metadata with durable evidence-backed correction';
let seen = false;
const lines = section.split('\n').filter(line => {
    if (!line.startsWith(prefix)) return true;
    if (seen) return false;
    seen = true;
    return true;
});
if (!seen) throw new Error('Missing passive Birthday changelog bullet during 0.4.4 dedupe');
source = before + lines.join('\n').replace(/\n{3,}/g, '\n\n') + after;
fs.writeFileSync(path, source);
console.log('Kept replayed v0.4.3 Birthday changelog entry idempotent under 0.4.4');
