import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.2 version marker: ' + label);
    return source.replace(from, to);
}

for (const path of fs.readdirSync('v03').filter(name => name.endsWith('.js')).map(name => 'v03/' + name)) {
    const source = read(path);
    if (source.includes('0.4.1')) write(path, source.replaceAll('0.4.1', '0.4.2'));
}

let manifest = read('manifest.json');
manifest = replaceRequired(manifest, '"version": "0.4.1"', '"version": "0.4.2"', 'manifest version');
write('manifest.json', manifest);

let readme = read('README.md');
readme = readme.replaceAll('0.4.1', '0.4.2');
write('README.md', readme);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## v0.4.2')) {
    changelog = replaceRequired(
        changelog,
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.2\n\n- Begins the phased v0.4.2 hardening line. Each recovery phase is applied and verified independently before the next phase is introduced.\n\n',
        'changelog header',
    );
}
write('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.2 version surfaces');
