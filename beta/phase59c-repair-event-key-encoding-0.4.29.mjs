import fs from 'node:fs';

function replaceSection(source, startMarker, endMarker, replacement, label) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) throw new Error('Missing 0.4.29 event-key repair section: ' + label);
    return source.slice(0, start) + replacement + source.slice(end);
}

const path = 'v03/scanner.js';
let source = fs.readFileSync(path, 'utf8');
source = replaceSection(
    source,
    '    const canonicalSources = sources.map(source => [',
    '    if (canonicalSources) return',
    `    const canonicalSources = JSON.stringify(sources.map(source => [\n        String(source?.id || ''),\n        String(source?.kind || ''),\n        relationshipDuplicateEvidenceKey(source?.text || ''),\n    ]));\n`,
    'canonical relationship source serialization',
);
fs.writeFileSync(path, source);
console.log('Repaired v0.4.29 relationship event-key serialization without control-character escapes');
