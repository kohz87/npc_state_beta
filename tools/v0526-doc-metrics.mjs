import fs from 'node:fs';

const measurePath = process.argv[2];
if (!measurePath) throw new Error('usage: node tools/v0526-doc-metrics.mjs <measure-output>');
const rows = new Map();
for (const raw of fs.readFileSync(measurePath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    try {
        const row = JSON.parse(line);
        if (row?.name && Number.isFinite(row?.estTokens)) rows.set(row.name, row.estTokens);
    } catch {}
}
const required = [
    'minimal-one-npc', 'rich-first-encounter', 'three-active-plus-mentioned', 'observation-development',
    'dense-collections-locks-forms', 'large-db-one-relevant', 'structured-plus-custom', 'targeted-refresh', 'long-current-response',
];
for (const name of required) if (!rows.has(name)) throw new Error(`missing measurement: ${name}`);
const n = name => Number(rows.get(name)).toLocaleString('en-US');
const text = `0.5.26 changes only the compact Current Dynamic target-binding wording; the stable matrix is ${n('minimal-one-npc')} tokens for the minimal one-NPC fixture, ${n('rich-first-encounter')} for a rich first encounter, ${n('three-active-plus-mentioned')} for three active plus one mentioned NPC, ${n('observation-development')} for observation development, ${n('dense-collections-locks-forms')} for dense collections/locks/forms, ${n('large-db-one-relevant')} with 1,000 stored NPCs but one relevant NPC, ${n('structured-plus-custom')} for structured blocks plus custom criteria, and ${n('targeted-refresh')} for targeted Refresh. The dense fixture is reported honestly against the approximate 7,500-token engineering target; no current-evidence truncation rule is introduced. A deliberately long current response remains about ${n('long-current-response')} estimated tokens because the current scene is preserved in full.`;
const path = 'README.md';
const source = fs.readFileSync(path, 'utf8');
if (!source.includes('__V0526_SCAN_MATRIX__')) throw new Error('README measurement placeholder missing');
fs.writeFileSync(path, source.replace('__V0526_SCAN_MATRIX__', text), 'utf8');
console.log(text);
