import fs from 'node:fs';
for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replaceAll('0.4.6', '0.4.7'));
}
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.6', '0.4.7'].includes(manifest.version)) throw new Error('Expected the complete 0.4.6 baseline');
manifest.version = '0.4.7';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.scripts = { ...packageJson.scripts, test: 'node beta/verify-all.mjs' };
fs.writeFileSync('package.json', JSON.stringify(packageJson, null, 2) + '\n');
let readme = fs.readFileSync('README.md', 'utf8').replaceAll('0.4.6', '0.4.7');
if (!readme.includes('## Scanner output and relationship diagnostics')) readme += '\n## Scanner output and relationship diagnostics\n\nRecovery & Branch Safety includes **Maximum scanner response tokens**, from 512 to 15,000 (default 7,000). This output ceiling applies to separate scans, dossier Refresh, structured imports, and JSON retries. It does not change foreground RP output or the recent-history window. Use a model/provider that supports the selected output allowance.\n\nDossiers include expandable **Relationship scoring** details: per-axis gate status, fractional progress, before/after scores, unlocks, and recent rejection reasons. Diagnostics are private continuity bookkeeping and are not injected into roleplay. A meaningful event may unlock a gate while the displayed score stays at the boundary because of fractional progress.\n';
fs.writeFileSync('README.md', readme);
let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.7')) changelog = changelog.replace('# Changelog\n\n', '# Changelog\n\n' + "## v0.4.7\n\n- Preserves untouched relationship milestones on manual dossier saves; only changed axes gain manual milestone adjustments, and partial score edits preserve omitted axes.\n- Makes relationship event deduplication direction/outcome-aware, preserves raw evidence deltas, and clears timeline-local evidence during cross-chat imports and rebases. Null timeline references no longer behave as turn zero.\n- Adds clause-local relationship grounding with conservative negation/outcome checks and matching source-quote guidance. These local checks reduce contradictory evidence acceptance without claiming full natural-language entailment.\n- Makes embedded relationship application idempotent at the engine boundary across payload paraphrases and reloads, while requiring branch reconciliation for changed processed content.\n- Adds bounded private scoring diagnostics and dossier gate/fractional-progress details, including rejected attempts and per-axis unlocks.\n- Adds Maximum scanner response tokens under Recovery & Branch Safety (512\u201315,000; default 7,000), shared by standalone scans, targeted Refresh, structured imports, and JSON retries. Foreground RP limits and scan history depth are unchanged.\n- Repairs outdated regression expectations, makes historical verifier transformations repeatable, and runs all checked-in verifier suites in CI.\n\n");
fs.writeFileSync('CHANGELOG.md', changelog);
console.log('Prepared NPC State Beta 0.4.7');
