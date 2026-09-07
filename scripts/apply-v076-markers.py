from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path): return (ROOT / path).read_text()
def write(path, text): (ROOT / path).write_text(text)
def once(text, old, new, label):
    n = text.count(old)
    if n != 1: raise SystemExit(f'{label}: expected 1, found {n}')
    return text.replace(old, new, 1)

p = 'src/scan-helpers.js'
s = read(p)
s = once(s,
    "'IDENTITY HANDOFF: EXISTING NPC patches use supplied stable ids; name-only dossiers enrich via semanticUpdates. NEW NPC patches leave id empty, use the canonical human-facing name/readable unique role label in activity refs, and let NPC State assign the stored id.'",
    "'IDENTITY HANDOFF: EXISTING NPC patches use supplied stable ids. NAME-ONLY ENRICHMENT: stored name-only dossiers keep that id and enrich via semanticUpdates. NEW NPC patches leave id empty, use the canonical human-facing name/readable unique role label in activity refs. NPC State assigns the stored id locally.'",
    'identity marker')
s = once(s,
    "'EVALUATION: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses field ids; evaluatedGroups is group-only. contextCoverage.unavailable/partial means compacted/truncated stored context, not empty.'",
    "'FIELD EVALUATION DETAIL: fieldEvaluations={unchanged:[],insufficient:[],unavailable:[]} uses field ids; evaluatedGroups is group-only. contextCoverage.unavailable/partial means compacted/truncated stored context, not empty.'",
    'evaluation marker')
write(p, s)

p = 'src/foreground-contract.js'
s = read(p)
s = once(s,
    "import { DOSSIER_EVALUATION_GROUPS, dossierFirstPassLiveFieldList, dossierSemanticFieldList } from './model/dossier-fields.js';",
    "import { DOSSIER_EVALUATION_GROUPS, dossierFirstPassLiveFieldList } from './model/dossier-fields.js';",
    'dead foreground field-list import')
s = once(s,
    "    const fields = dossierSemanticFieldList();\n",
    "",
    'dead foreground field-list variable')
s = once(s,
    "`ONE DOSSIER PIPELINE: EXISTING extraction-map fields use semanticUpdates (${SEMANTIC_UPDATE_OPERATIONS.join('|')}) only; never also emit legacy/direct replacements. NEW bootstrap may use grounded direct fields.`,",
    "`ONE DOSSIER UPDATE PIPELINE: EXISTING ordinary changes use semanticUpdates only (${SEMANTIC_UPDATE_OPERATIONS.join('|')}); never also emit legacy/direct replacements. NEW bootstrap may use grounded direct fields.`,",
    'pipeline marker')
s = once(s,
    "`COVERAGE: exchange-active EXISTING NPCs list evaluatedGroups for supplied groups and fieldEvaluations for unchanged/insufficient/unavailable fields; group-only is not field proof. ${firstPassLiveFields} remain required comparisons.`,",
    "`COVERAGE: exchange-active EXISTING NPCs list evaluatedGroups for supplied groups and fieldEvaluations for unchanged/insufficient/unavailable fields; group-only is not field proof. The live group specifically means every supplied first-pass live value (${firstPassLiveFields}) was considered.`,",
    'live coverage marker')
# Keep the prior explicit all-live-field sequence used by contract tests and human diagnostics.
s = once(s,
    "`FIRST-PASS LIVE STATE: ${firstPassLiveFields} are never pruned for selected EXISTING dossiers; compare them, preserve on insufficient evidence, remove only when conclusively ended. currentForm is live too; status is activity/condition, not presence.`,",
    "`FIRST-PASS LIVE STATE: ${firstPassLiveFields}|currentForm are never pruned for selected EXISTING dossiers; compare them, preserve on insufficient evidence, remove only when conclusively ended. status is activity/condition, not presence.`,",
    'live field marker')
write(p, s)

# Deliberate v5 assertion in the foreground integration test.
p = 'tests/foreground-injection.test.mjs'
s = read(p).replace('/FOREGROUND CONTRACT v4/g', '/FOREGROUND CONTRACT v5/g')
write(p, s)

print('Applied v0.7.6 compatibility markers and lean foreground cleanup.')
