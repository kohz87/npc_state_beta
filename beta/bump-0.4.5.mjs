import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.5 version marker: ' + label);
    return source.replace(from, to);
}

for (const path of fs.readdirSync('v03').filter(name => name.endsWith('.js')).map(name => 'v03/' + name)) {
    const source = read(path);
    if (source.includes('0.4.4')) write(path, source.replaceAll('0.4.4', '0.4.5'));
}

let manifest = read('manifest.json');
manifest = replaceRequired(manifest, '"version": "0.4.4"', '"version": "0.4.5"', 'manifest version');
write('manifest.json', manifest);

let readme = read('README.md');
readme = readme.replaceAll('0.4.4', '0.4.5');
write('README.md', readme);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## v0.4.5')) {
    changelog = replaceRequired(
        changelog,
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.5\n\n- Simplifies appearance presentation to two authoritative reader-facing surfaces: resolved Current appearance and the complete Appearance forms registry. Redundant standalone Current form and Shared / ordinary appearance lines are removed from dossier display and foreground continuity while all underlying storage, editing, form synchronization, age progression, portrait, and scanner safeguards remain unchanged.\n\n',
        'changelog header',
    );
}
write('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.5 version surfaces');
