import fs from 'node:fs';

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.7', '0.4.8'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.7', '0.4.8'].includes(manifest.version)) throw new Error('Expected the complete 0.4.7 baseline');
manifest.version = '0.4.8';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.7', '0.4.8');
if (!readme.includes('## Relationship milestone gate invariants')) {
    readme += '\n## Relationship milestone gate invariants\n\nRelationship milestone gates are fixed evidence thresholds, independently for each axis and positive/negative polarity. A locked boundary may be reached by weaker evidence, but deepening beyond it requires: **25 = meaningful-or-stronger with at least 1 raw point on that axis; 50 = major-or-stronger with at least 3 raw points; 75 = extreme with at least 5 raw points; 90 = extreme with at least 8 raw points.** These raw minima are not reduced when relationship tier caps are configured below them; a configuration that cannot supply the required raw evidence simply cannot unlock that gate. Movement back toward neutral is never milestone-blocked. Inertia is applied after the raw evidence weight and does not lower the gate requirement.\n';
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.8')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.8\n\n- Makes relationship milestone raw-evidence minima invariant: 25 requires meaningful-or-stronger with raw >=1, 50 major-or-stronger with raw >=3, 75 extreme with raw >=5, and 90 extreme with raw >=8. Lower configured tier caps no longer silently weaken a gate; movement toward neutral remains unblocked and inertia still applies only after raw evidence qualification.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.8');
