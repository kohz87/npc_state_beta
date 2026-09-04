import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value);

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.4 version marker: ' + label);
    return source.replace(from, to);
}

for (const path of fs.readdirSync('v03').filter(name => name.endsWith('.js')).map(name => 'v03/' + name)) {
    const source = read(path);
    if (source.includes('0.4.3')) write(path, source.replaceAll('0.4.3', '0.4.4'));
}

let manifest = read('manifest.json');
manifest = replaceRequired(manifest, '"version": "0.4.3"', '"version": "0.4.4"', 'manifest version');
write('manifest.json', manifest);

let readme = read('README.md');
readme = readme.replaceAll('0.4.3', '0.4.4');
write('README.md', readme);

let changelog = read('CHANGELOG.md');
if (!changelog.includes('## v0.4.4')) {
    changelog = replaceRequired(
        changelog,
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.4\n\n- Reorganizes the growing settings surface into compact semantic collapsible categories without changing tracking, persistence, branch, Inventory, or dossier behavior. Tracking remains open by default while secondary categories stay collapsed.\n\n',
        'changelog header',
    );
}
write('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.4 version surfaces');
