import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing canonical-branch-fingerprint marker: ' + label);
    return source.replace(from, to);
}

let branches = read('v03/branches.js');
const helper = `
function canonicalAssistantMessageText(value = '') {
    const source = String(value ?? '');
    const withoutNpc = source
        .replace(/<npc_state_v1\\b[^>]*>[\\s\\S]*?<\\/npc_state_v1\\s*>/gi, '')
        .replace(/<npc_state_v1\\b[^>]*>[\\s\\S]*$/gi, '');
    const withoutInventory = withoutNpc.replace(/<!--\\s*INVENTORY_BLOCK_UPDATE\\b[\\s\\S]*?-->\\.?/gi, '');
    return withoutInventory.replace(/\\n{3,}/g, '\\n\\n').trimEnd();
}
`;
branches = replaceRequired(
    branches,
    '\nexport function fingerprintMessage(message = {}) {',
    helper + '\nexport function fingerprintMessage(message = {}) {',
    'canonical helper insertion',
);
branches = replaceRequired(
    branches,
    "    return `${role}:${swipe}:${fnv1a(String(message.mes ?? ''))}`;",
    "    const text = role === 'a' ? canonicalAssistantMessageText(message.mes) : String(message.mes ?? '');\n    return `${role}:${swipe}:${fnv1a(text)}`;",
    'fingerprint canonical text',
);
write('v03/branches.js', branches);

let changelog = read('CHANGELOG.md');
const changelogLine = '- Canonicalized assistant-message branch fingerprints so transient `<npc_state_v1>` and `INVENTORY_BLOCK_UPDATE` controls do not make an unchanged visible narrative look like a different branch after post-generation cleanup; this improves recent message-delete rollback reliability.\n';
if (!changelog.includes(changelogLine.trim())) {
    changelog = replaceRequired(
        changelog,
        '## v0.4.1\n\n',
        '## v0.4.1\n\n' + changelogLine,
        'changelog v0.4.1 heading',
    );
    write('CHANGELOG.md', changelog);
}

console.log('Canonicalized NPC State 0.4.1 branch fingerprints');
