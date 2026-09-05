import fs from 'node:fs';

function replaceRequired(source, from, to, label) {
    if (!source.includes(from)) throw new Error('Missing 0.4.17 version marker: ' + label);
    return source.replace(from, to);
}

for (const name of fs.readdirSync('v03').filter(name => name.endsWith('.js'))) {
    const path = 'v03/' + name;
    const source = fs.readFileSync(path, 'utf8');
    fs.writeFileSync(path, source.replaceAll('0.4.16', '0.4.17'));
}

const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
if (!['0.4.16', '0.4.17'].includes(manifest.version)) throw new Error('Expected the complete 0.4.16 baseline');
manifest.version = '0.4.17';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 4) + '\n');

let readme = fs.readFileSync('README.md', 'utf8');
readme = replaceRequired(readme, '# NPC State Beta 0.4.16', '# NPC State Beta 0.4.17', 'README title');
readme = readme.replace('On first load for a chat with no beta sidecar, 0.4.16 clones', 'On first load for a chat with no beta sidecar, 0.4.17 clones');
readme = readme.replace('its v0.4.16 meaning is **in chat**', 'its v0.4.17 meaning is **in chat**');
const oldGrounding = `## Relationship evidence grounding\n\n- v0.4.16 keeps strict target-direction and polarity checks, but ordinary Trust evidence no longer depends only on near-verbatim token overlap with one narration clause.\n- A narrow semantic fallback can ground a small Trust change when the scanner paraphrases a clearly player-attributed task result, such as reliable bounty completion, timely delivery, competent work, or a fulfilled responsibility. The original lexical grounding path remains the first choice.\n- The fallback is fail-closed: it applies only to ordinary single-axis Trust movement, requires a player-attributed concrete event, rejects conflicting/failed performance, does not weaken Desire evidence, and does not relax meaningful/major/extreme relationship gates.\n`;
const newGrounding = `## Relationship evidence grounding\n\n- v0.4.17 separates evidence validity from progression difficulty. The lexical path remains first choice, while the semantic fallback may ground a single-axis Trust, Affection, or Tension change at any impact tier when the current exchange independently proves the concrete player-attributed event behind the scanner's paraphrase.\n- Semantic grounding validates that the event happened, belongs to the player, concerns the target NPC, and plausibly supports the proposed axis/direction. It does not make meaningful/major/extreme events easier and it never bypasses relationship inertia or milestone requirements.\n- The fallback remains fail-closed: wrong actors, actorless events, contradictory outcomes, failed positive-performance claims, unrelated NPCs, and ambiguous multi-axis paraphrases are rejected. Desire remains outside broad semantic inference and still requires explicit attraction/intimacy evidence in both scanner evidence and narration.\n`;
readme = replaceRequired(readme, oldGrounding, newGrounding, 'relationship grounding section');
if (!readme.includes('## Relationship progression curve')) {
    readme = readme.replace(
        '## Relationship milestone gate invariants',
        `## Relationship progression curve\n\nDeepening movement uses the same bands as the milestone system: **0–24 = ×1.00, 25–49 = ×0.80, 50–74 = ×0.60, 75–89 = ×0.40, 90–100 = ×0.25**. Fractional progress is retained between accepted events. Movement back toward neutral keeps its easier recovery multipliers instead of inheriting the deepening curve.\n\nThe milestone boundaries remain narrative locks rather than extra friction inside the band: **25 = meaningful with at least 1 raw point, 50 = major with at least 3 raw points, 75 = extreme with at least 5 raw points, 90 = extreme with at least 8 raw points.** Ordinary history may accumulate up to a locked boundary, but a qualifying event is required to establish movement beyond it.\n\n## Relationship milestone gate invariants`,
    );
}
fs.writeFileSync('README.md', readme);

let changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
if (!changelog.includes('## v0.4.17')) {
    changelog = changelog.replace(
        '# Changelog\n\n',
        '# Changelog\n\n## v0.4.17\n\n- Aligns deepening relationship inertia with the actual milestone bands: 0–24 ×1.00, 25–49 ×0.80, 50–74 ×0.60, 75–89 ×0.40, and 90–100 ×0.25. Fractional accumulation and easier movement back toward neutral are preserved.\n- Keeps the 25/50/75/90 milestone gates and raw evidence minima unchanged, so difficulty comes from the progression curve plus narrative gates rather than mismatched overlapping thresholds.\n- Separates semantic evidence validity from impact difficulty: single-axis Trust, Affection, and Tension paraphrases can be grounded across impact tiers when a concrete player-attributed event for the target NPC is present.\n- Keeps broad Desire inference disabled and preserves actor ownership, target direction, polarity, contradiction, failure, and multi-axis ambiguity safeguards.\n\n',
    );
}
fs.writeFileSync('CHANGELOG.md', changelog);

console.log('Prepared NPC State Beta 0.4.17');
