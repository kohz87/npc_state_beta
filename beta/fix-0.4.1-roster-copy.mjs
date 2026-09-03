import fs from 'node:fs';

const path = 'v03/ui.js';
let source = fs.readFileSync(path, 'utf8');

const replacements = [
    [
        "Open a chat to load its v0.3 dossier.",
        "Open a chat to load its NPC State dossier.",
    ],
    [
        "Persistent v0.3 database · ${active.length} active · ${archived.length} archived",
        "Persistent NPC State 0.4.1 database · ${active.length} active · ${archived.length} archived",
    ],
    [
        "console.error(`[NPC State v0.3] ${label} failed safely`, error);",
        "console.error(`[NPC State v0.4.1] ${label} failed safely`, error);",
    ],
];

for (const [from, to] of replacements) {
    if (!source.includes(from)) throw new Error(`Missing roster-copy marker: ${from}`);
    source = source.replace(from, to);
}

fs.writeFileSync(path, source);
console.log('Updated NPC State 0.4.1 roster copy');
