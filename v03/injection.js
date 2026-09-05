import { structuredEvidencePromptRules } from './evidence-adapter.js';
import { resolvedCurrentAppearance } from './appearance.js';
import { normalizeNpcAdmissionMode } from './schema.js';

function foregroundAdmissionRule(mode = 'balanced') {
    const policy = normalizeNpcAdmissionMode(mode);
    if (policy === 'manual') return 'NEW NPC ADMISSION POLICY: Manual. Do not emit new npcs entries or new activity references for untracked characters. Existing NPCs still update normally.';
    if (policy === 'named_preferred') return 'NEW NPC ADMISSION POLICY: Named preferred. Propose a new dossier only when a proper/personal name is established, with identityKind named. First-seen unnamed role labels remain narrative-only.';
    return 'NEW NPC ADMISSION POLICY: Balanced. Individually relevant named NPCs and genuinely unique role-label NPCs may be proposed; set identityKind to named or role-label accurately.';
}

function field(label, value) {
    const text = String(value ?? '').trim();
    return text ? label + ': ' + text : '';
}

function appearanceFormsText(npc = {}) {
    const forms = Array.isArray(npc.appearanceForms) ? npc.appearanceForms.filter(Boolean) : [];
    if (!forms.length) return '';
    const currentKey = String(npc.currentForm || '').trim().toLocaleLowerCase();
    const ordered = [...forms].sort((a, b) => Number(String(b?.name || '').trim().toLocaleLowerCase() === currentKey) - Number(String(a?.name || '').trim().toLocaleLowerCase() === currentKey));
    const rows = [];
    let used = 0;
    for (const form of ordered.slice(0, 12)) {
        const name = String(form?.name || '').trim();
        const appearance = String(form?.appearance || '').trim().slice(0, 1200);
        if (!name || !appearance) continue;
        const row = name + (name.toLocaleLowerCase() === currentKey ? ' [CURRENT]' : '') + ': ' + appearance;
        if (used + row.length > 6000) break;
        rows.push(row);
        used += row.length;
    }
    return rows.join(' | ');
}

function relationshipBand(value, positive, negative) {
    const score = Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
    const magnitude = Math.abs(score);
    if (magnitude < 10) return 'little established signal';
    if (magnitude < 30) return score > 0 ? 'slightly ' + positive : 'slightly ' + negative;
    if (magnitude < 70) return score > 0 ? 'established ' + positive : 'established ' + negative;
    if (magnitude < 90) return score > 0 ? 'strong ' + positive : 'strong ' + negative;
    return score > 0 ? 'very deep ' + positive : 'very deep ' + negative;
}

export function qualitativeRelationshipLens(npc = {}) {
    const rel = npc.relationship || {};
    return [
        'Trust: ' + relationshipBand(rel.trust, 'confidence/reliance', 'distrust/wariness'),
        'Affection: ' + relationshipBand(rel.affection, 'warmth/attachment', 'dislike/emotional distance'),
        'Desire: ' + relationshipBand(rel.desire, 'attraction/intimate interest', 'aversion/lack of intimate interest'),
        'Tension: ' + relationshipBand(rel.tension, 'interpersonal strain/charged friction', 'ease/low strain'),
    ].join('; ');
}

function npcContinuityLines(npc) {
    return [
        'NPC ' + npc.id + ' | ' + npc.name + (npc.role ? ' | ' + npc.role : ''),
        field('Species', npc.species), field('Actual age', npc.age), field('Apparent age', npc.apparentAge),
        field('Birthday', npc.birthday),
        field('Current appearance', resolvedCurrentAppearance(npc)),
        field('Appearance forms', appearanceFormsText(npc)),
        field('Personality', npc.personality), field('Behavior', (npc.behaviorProfile || []).join(' | ')), field('Speech', npc.speech),
        field('Goal', npc.goal), field('Status', npc.status), field('Key non-player relationships', (npc.keyRelationships || []).join(' | ')),
        'Player relationship lens: ' + qualitativeRelationshipLens(npc),
        field('Relationship summary', npc.relationshipSummary),
        field('Mannerisms', (npc.mannerisms || []).join(' | ')), field('Important memories', (npc.memories || []).join(' | ')),
        field('Mood', npc.mood), field('Location', npc.location), field('Background', npc.background), field('Aliases', (npc.aliases || []).join(' | ')),
    ].filter(Boolean);
}

function fitNpcBlock(npc, maxChars) {
    const lines = npcContinuityLines(npc);
    const out = [];
    let used = 0;
    for (const line of lines) {
        const text = String(line || '').trim();
        if (!text) continue;
        const cost = text.length + (out.length ? 1 : 0);
        if (used + cost > maxChars) continue;
        out.push(text);
        used += cost;
    }
    return out.join('\n');
}

function buildReservedDossiers(candidates, budgetChars) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length || budgetChars <= 0) return '';
    const blocks = [];
    let remaining = budgetChars;
    for (let i = 0; i < list.length; i += 1) {
        const left = list.length - i;
        const fairShare = Math.max(420, Math.floor(remaining / left));
        const block = fitNpcBlock(list[i], fairShare);
        if (!block) continue;
        const cost = block.length + (blocks.length ? 2 : 0);
        if (cost > remaining) continue;
        blocks.push(block);
        remaining -= cost;
    }
    return blocks.join('\n\n');
}

function identityDirectory(state) {
    return (state?.npcs || []).slice(0, 400).map(npc => [npc.id, npc.name, (npc.aliases || []).join('/'), npc.role, npc.archived ? 'archived' : 'active'].join(' | ')).join('\n');
}

export function runtimeNpcSalience(npc, state = {}) {
    const activeIds = new Set([...(state?.lastObservation?.exchangeActiveNpcIds || []), ...(state?.lastObservation?.finalPresentNpcIds || []), ...(state?.lastObservation?.worldActiveNpcIds || [])]);
    return (npc?.present ? 1000 : 0)
        + (npc?.worldActive ? 400 : 0)
        + (activeIds.has(npc?.id) ? 300 : 0)
        + Math.max(0, Math.min(100, Number(npc?.importance) || 0));
}

function injectionReferenceText(value, max = 12000) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim().slice(0, max);
}
function currentUserReferencedNpcIds(state, currentUserText = '') {
    const haystack = ' ' + injectionReferenceText(currentUserText) + ' ';
    if (!haystack.trim()) return new Set();
    const ids = new Set();
    for (const npc of state?.npcs || []) {
        const labels = [npc?.name, ...(npc?.aliases || [])]
            .map(value => injectionReferenceText(value, 600))
            .filter(value => value.length >= 2);
        if (labels.some(label => haystack.includes(' ' + label + ' '))) ids.add(npc.id);
    }
    return ids;
}

function activeCandidates(state, limit, currentUserText = '') {
    const explicitlyReferenced = currentUserReferencedNpcIds(state, currentUserText);
    return (state?.npcs || [])
        .filter(npc => !npc.archived || (explicitlyReferenced.has(npc.id) && String(npc.archiveReason || '').toLocaleLowerCase() !== 'deceased'))
        .sort((a, b) =>
            Number(explicitlyReferenced.has(b.id)) - Number(explicitlyReferenced.has(a.id))
            || runtimeNpcSalience(b, state) - runtimeNpcSalience(a, state)
            || Number(b.lastInteractionMessageId ?? -1) - Number(a.lastInteractionMessageId ?? -1)
            || Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
        ).slice(0, limit);
}

export function buildInjection(state, settings = {}) {
    if (state?.branchSafety?.status && state.branchSafety.status !== 'safe') return '';
    if (settings.enabled === false) return '';
    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    const budgetTokens = Math.max(512, Math.min(12000, Math.round(Number(settings.injectBudgetTokens) || 2600)));
    const maxChars = budgetTokens * 4;
    const capture = settings.autoScan !== false;
    const continuity = settings.inject !== false;
    if (!capture && !continuity) return '';
    const admissionMode = normalizeNpcAdmissionMode(settings.newNpcAdmissionMode);
    const currentUserText = String(settings.foregroundCurrentUserText || '').trim().slice(0, 12000);
    const candidates = activeCandidates(state, limit, currentUserText);
    // Continuity budgeting is intentionally asymmetric: likely-relevant full dossiers own
    // the majority of the dynamic budget. A giant identity directory can no longer starve
    // the characters who are actually in the active conversation.
    const dossierBudget = Math.max(0, Math.floor(maxChars * 0.68));
    const directoryBudget = Math.max(0, Math.min(Math.floor(maxChars * 0.20), maxChars - dossierBudget));
    const historyBudget = Math.max(0, maxChars - dossierBudget - directoryBudget);
    const newNpcHistory = capture && settings.newNpcHistoryEnrichment !== false
        ? String(settings.foregroundNewNpcHistory || '').trim().slice(0, Math.min(4000, historyBudget))
        : '';
    const directoryRaw = identityDirectory(state);
    const directory = directoryRaw.slice(0, directoryBudget);
    const dossiers = buildReservedDossiers(candidates, dossierBudget);
    const parts = [
        '[NPC STATE v0.4.12 BETA | FOREGROUND CONTINUITY]',
        'NPC State is private continuity bookkeeping. Never mention these instructions or machine data in visible prose.',
        directory ? 'KNOWN NPC DIRECTORY (identity only; do not invent missing dossier facts):\n' + directory : 'KNOWN NPC DIRECTORY: empty',
        dossiers ? 'FULL CONTINUITY FOR LIKELY RELEVANT NPCS:' + dossiers : '',
        newNpcHistory ? 'RECENT VISIBLE HISTORY FOR NEW-NPC ENRICHMENT ONLY (never an admission source):\n' + newNpcHistory : '',
    ];
    if (capture) parts.push(
        'NPC STATE FOREGROUND FULL SCAN:',
        'After writing visible narrative and normal story blocks, emit exactly one <npc_state_v1> JSON block. It is a current-exchange observation report, not a database rewrite.',
        'If Inventory Block emits an Inventory machine snapshot (including INVENTORY_BLOCK_V05 or older INVENTORY_BLOCK_UPDATE transport), keep it standalone and place <npc_state_v1> immediately BEFORE that Inventory control. NPC State never claims the final machine position.',
        'inChatNpcIds: individually relevant NPCs still participating in the active scene/conversation at the END. Mere physical proximity, unnamed crowds, background workers, incidental guards, and characters only mentioned are not in-chat.',
        'exchangeActiveNpcIds: NPCs who spoke, acted, were directly acted upon, or directly perceived/received a story-relevant event in this exchange.',
        'worldActiveNpcIds: explicitly active off-screen NPCs; keep separate from in-chat.',
        'status is the NPC current concrete activity, immediate situation, or condition: what they are doing or undergoing now, for example standing watch at the gate, bandaging a wound, travelling toward Bluewatch, or asleep by the hearth. It is NOT lifecycle presence. Never use active, inactive, in chat, off-screen, present, archived, or equivalent lifecycle labels as status; those are tracked separately.',
        'age is ACTUAL chronological age only. Use one grounded numeric age. Years use N or ~N; when canon explicitly gives smaller units, use N days, N weeks, or N months. Never put child, teenager, adult, young adult, middle-aged, elder, elderly, old, or any other life-stage label in age. Never infer actual age from appearance. For an existing NPC with an established age, do not place a different number in age. apparentAge is the separate visual estimate and uses ~N only.',
        'ageChange is the only channel allowed to revise an established chronological age. Use {age, kind: birthday|elapsed|correction, evidence}. birthday requires explicit birthday/turned-N evidence; elapsed requires explicit passage of time AND narration stating the resulting age; correction requires an explicit correction/mistake statement. Evidence must state the new numeric age. Casual contradictory age prose, appearance guesses, and unstated arithmetic must leave ageChange empty.',
        'birthday is separate passive continuity metadata. Preserve compact freeform calendar text exactly, including fantasy calendars such as 14 Frostwane. Never infer birthday from age, calculate age from birthday, or treat a stored/generated birthday as proof that a birthday happened now. For an established explicit/manual birthday, use canonChanges field birthday mode correction only when the current exchange explicitly corrects it. If the current exchange explicitly establishes a birthday that differs from the stored Birthday, return the explicit current value; backend provenance/correction rules decide whether replacement is authorized.',
        'AGE-LINKED APPEARANCE EVOLUTION: whenever you propose a valid birthday or elapsed ageChange, reconsider apparentAge and age-sensitive appearance in the SAME observation. Use ageProgression {maturation: ordinary|accelerated|long_lived|ageless|unknown, meaningful, basis, evidence, affectsShared, affectedForms}. Infer maturation behavior only from established species, setting lore, existing apparent age, or known biology; unknown fantasy species stay conservative. correction never matures the body. Do not invent a rewrite for every adult birthday. Long-lived races normally need larger intervals, ageless beings stay visually unchanged, and accelerated-growth species may change faster. It is valid to emit no visual changes. Minor maturation wording must remain neutral and non-sexual.',
        'AGE-PROGRESSION CHANNELS: use canonChanges mode age_progression only for age-sensitive shared/ordinary appearance and appearanceFormChanges mode age_progression only for existing forms named in ageProgression.affectedForms. Preserve hair/eye colors, scars, species markers, magical traits, horn/wing/tail structure, and unrelated anatomy. If appearance still duplicates Base, revise Base and let NPC State synchronize the compatibility scalar. Never replace unrelated forms.',
        'appearance is shared/common physical description, or the ordinary baseline appearance. currentForm is live physical-form state only; leave it empty for ordinary non-transforming NPCs. A form MAY be temporary, reversible, magical, elemental, spectral, or energy-made when it is a coherent transformed body state with materially different anatomy, body plan, or silhouette. Partial transformations count when they manifest form-defining anatomy such as horns, wings, tails, scales, feathers, claws, or a changed body shape, even if those parts are ethereal or energy-made. Mere aura, glow, spell particles, clothing, disguise, pose, mood, or injury is not a form. If an existing NPC first reveals alternate forms and ends back in the ordinary body represented by stored appearance, use currentForm Base.',
        'appearanceForms is durable form-specific canon. Durable means the stored DESCRIPTION remains canonical; the transformation itself may be temporary or reversible. Capture EVERY distinct form state explicitly entered in this response, including both a partial/hybrid manifestation and a later full beast body when both occur. For unnamed transformed states use a concise descriptive morphology label such as Partial manifestation rather than inventing lore taxonomy. For a NEW multi-form NPC include every grounded form, including its baseline form when actually described. For an EXISTING NPC return only genuinely NEW forms; NPC State locally preserves its pre-existing ordinary appearance as Base when the first alternate form arrives. If an older scan already captured an alternate but no Base and this response ends back in the stored ordinary body, set currentForm to Base so the baseline can be recovered locally. Never rewrite a known form from casual contradictory prose. Existing form dimensions/anatomy/colors/proportions are sticky.',
        'appearanceFormChanges is the only scanner channel allowed to revise an existing form. Normally it requires an explicit current-exchange correction or real persistent growth/change/evolution. mode age_progression is the narrow inferred exception after an accepted meaningful birthday/elapsed maturation transition and only for forms listed in ageProgression.affectedForms. Include grounded evidence; the backend verifies the transition/change authority. Otherwise omit/null it.',
        foregroundAdmissionRule(admissionMode),
        'Every new individually relevant NPC allowed by the active admission policy needs a full npcs entry with all grounded foundational information established by the current exchange. If the NEW-NPC HISTORY capsule is present, the current exchange must STILL independently introduce/admit that NPC; only after admission may matching older visible history enrich durable foundational profile facts and important memories. Unknown biography stays empty/null; never invent facts to fill the schema.',
        'For NEW NPC identity: if a proper/personal name is known in this response, npcs.name MUST be that canonical name and nothing else. npcs.name is human-facing display text and MUST NEVER be an npc-* identifier, slug, key, or machine label, and MUST NEVER begin with npc-. Put occupation or function such as Clerk, Guard, Innkeeper, or Receptionist in role, not in name. Use a human-readable unique role label as name only while the NPC is genuinely unnamed. Always use id as an empty string for a new NPC; NPC State assigns the stable id locally. Never invent an npc-* id.',
        'For a NEW NPC, behaviorProfile, mannerisms, keyRelationships, and memories are bootstrap collections: return ARRAYS containing grounded entries established by the current exchange plus matching older visible history from the optional NEW-NPC HISTORY capsule; use [] only when none are supported. Do not use null for those four fields on a new NPC. History may enrich only the newly admitted NPC durable identity/profile/background/forms/key relationships/memories. It must NEVER create an NPC by itself, set exchangeActive/inChat/worldActive, supply current mood/location/goal/status, or replay relationshipChange/relationshipSummary. The current exchange alone determines those live and player-relationship channels.',
        'For significant NPC-to-NPC relationships, especially explicit family, kinship, spouse, guardian, or dependent ties, keyRelationships is mandatory dossier data. When such a tie is established, include the other NPC by name and the directional relationship from THIS NPC perspective in each involved NPC keyRelationships whenever that NPC has a returned dossier. socialEdges is complementary graph data and MUST NOT substitute for keyRelationships. For an EXISTING NPC, revealing or changing a significant tie is a material keyRelationships change: return the affected counterpart entry; NPC State preserves omitted still-valid ties locally. Remove a durable tie only through keyRelationshipChanges with action remove and explicit evidence.',
        'KeyRelationships entries MUST be strings, never objects. Use the canonical form Other NPC name - relationship from THIS NPC perspective, for example Mira - sister or Tomas - father. A short clarifying note may follow after a colon when useful. For existing NPCs this array is a counterpart MERGE PATCH, not a whole-list replacement; omission never deletes another established tie. Use keyRelationshipChanges only for explicit removals, with evidence copied or faithfully paraphrased from visible current-exchange narration; the backend verifies it.',
        'COUNTABLE UNNAMED FAMILY: when narration explicitly establishes facts such as an existing NPC having two daughters, three children, or twin sons while some relatives are unnamed, put that count in top-level familyFacts with owner, relation, count, optional descriptor/twinGroup, and evidence. Do NOT create fake NPC dossiers or placeholder names for unnamed relatives. Later named family relationships may resolve those slots; shared confirmed parent slots may support generic sibling/twin-sibling inference.',
        'A single scan may introduce MULTIPLE new individually relevant NPCs. Do not stop after the first. Return one separate npcs object for every such NPC. For every NEW NPC use id as an empty string; never invent a stable ID. Reference each new NPC in exchangeActiveNpcIds, inChatNpcIds, or worldActiveNpcIds by the exact canonical name or unique role label that appears in its npcs object. Do not add new npcs entries for named-only mentions, crowds, background workers, incidental guards, or other non-individually-relevant characters.',
        'A single scan may update MULTIPLE existing NPCs in the same response. Do not stop after the first and do not omit a dossier patch merely because another NPC is more prominent. Return one separate npcs object for every individually relevant existing NPC whose grounded dossier data is established, corrected, or materially changed in this response. Keep exchangeActiveNpcIds, inChatNpcIds, and worldActiveNpcIds complete for their own semantics.',
        'For existing NPCs, do a full semantic scan while preserving continuity. Evolving arrays use null when unchanged or the COMPLETE replacement set when revised. Stable scalar fields contain only grounded new/corrected facts.',
        'DURABLE SCALAR CANON: established ordinary Appearance, Species, Background, Role, and Birthday are sticky. If one truly changes, return canonChanges with the same replacement value and grounded evidence. Modes are refine|change|correction|revelation, with age_progression additionally allowed only for Appearance after the accepted maturation gate above. Ordinary Appearance change requires lasting physical change, Species requires explicit correction/revelation or genuine permanent transformation, Background requires grounded refinement/revelation/correction, and Role changes only on an actual promotion/reassignment/retirement/etc. importance is user/editor-owned and scanner importance is ignored.',
        'DURABLE PROFILE EVOLUTION: new NPCs may establish grounded foundational personality/behavior/speech/mannerisms in their first rich scene. For an EXISTING established personality, behaviorProfile, speech, or mannerisms, any real rewrite requires profileChanges with field, mode refine|gradual|explicit|batch, a short stable concept label, and concrete evidence. refine is compatible detail only, not no-longer/became/increasingly change or a morality flip. gradual means sustained same-concept development and requires confirmation from a DIFFERENT assistant message; rescanning the same message never counts twice. explicit requires a clearly lasting/corrective change in this exchange. batch requires an actual narrated time skip plus development across it. Never promote a one-off gesture into a mannerism unless narration marks it recurring/habitual.',
        'LIFE-STATE AUTHORITY: confirmed death needs explicit current-timeline evidence and a concrete lifeStateReason. A previously dead/deceased dossier may become alive only with livingReturn true plus a grounded reason showing survival, resurrection, correction, or physical return. Plain lifeState alive never resurrects a dead dossier.',
        'Relationship deltas require concrete current-exchange evidence. Each changed relationship axis needs its own support; zero is correct when evidence is weak.',
        'RELATIONSHIP HARDENING: ordinary may affect at most 1 axis, meaningful 2, major 3, extreme 4. Repeated aftermath or semantically duplicate events are zero. Raw deltas are evidence weights and high established relationships resist further deepening. Desire requires explicit romantic/intimate/physical attraction evidence in the visible CURRENT exchange; friendship, gratitude, rescue, beauty, proximity, trust, and generic affection are not Desire. Do not write a Relationship Summary deeper or more absolute than the accepted relationship state supports. The injected Player relationship lens is deliberately QUALITATIVE; never infer or echo hidden numeric meter values from its wording.',
        'RELATIONSHIP EVIDENCE: quote a short concrete event from the current exchange; preserve who acted, negation, and the outcome. Do not replace a quote with an inferred absolute trust/affection claim. Opposite outcomes are new events, while repeated aftermath earns zero. RELATIONSHIP MILESTONE GATES: absolute relationship depth is checkpointed at 25, 50, 75, and 90 independently per axis and positive/negative direction. Ordinary evidence may reach a locked boundary but cannot deepen beyond it. Crossing 25 requires meaningful-or-stronger evidence; 50 requires major-or-stronger with at least 3 raw points on that axis; 75 requires extreme with at least 5 raw points; 90 requires an extreme relationship-defining event with at least 8 raw points. Movement toward neutral is never gate-blocked. Do not inflate impact or delta merely to open a gate; the backend is authoritative.',
        settings.relationshipCriteria ? 'RELATIONSHIP RUBRIC:\n' + String(settings.relationshipCriteria).slice(0, 6000) : '',
        'MEMORY SEMANTIC HYGIENE: Important Memories are distinct durable events/facts, never a running paraphrase log. Collapse multiple phrasings of the same event/participants/outcome into one concise richest entry, but keep genuinely separate events even when they involve the same people or topic.',
        settings.memoryCriteria ? 'IMPORTANT MEMORY RUBRIC:\n' + String(settings.memoryCriteria).slice(0, 6000) : '',
        ...(settings.structuredEvidenceDetected === true ? structuredEvidencePromptRules() : []),
        'The PLAYER/current user persona is never an NPC. keyRelationships and socialEdges are NPC-to-NPC only.',
        'OUTPUT JSON SHAPE: {"exchangeActiveNpcIds":[],"inChatNpcIds":[],"worldActiveNpcIds":[],"npcs":[{"id":"existing id or empty","name":"human-facing canonical proper name when known; readable role label only if genuinely unnamed; never npc-*","identityKind":"named|role-label","aliases":[],"role":"","species":"","age":"initial actual chronological numeric age only or empty","ageChange":{"age":"new actual chronological age","kind":"birthday|elapsed|correction","evidence":"explicit grounded age-change evidence stating new age"},"ageProgression":{"maturation":"ordinary|accelerated|long_lived|ageless|unknown","meaningful":false,"basis":"","evidence":"","affectsShared":false,"affectedForms":[]},"apparentAge":"~N or empty","birthday":"explicit compact freeform calendar birthday or empty","appearance":"shared/common or ordinary single-form appearance","currentForm":"current physical form or empty","appearanceForms":[{"name":"new physical form","appearance":"durable canonical form appearance"}],"appearanceFormChanges":[{"name":"existing form explicitly changed","appearance":"replacement canonical form appearance","mode":"change|age_progression","evidence":"explicit correction/growth/change or accepted age-transition evidence"}],"personality":"","behaviorProfile":[],"speech":"","mannerisms":[],"profileChanges":[{"field":"personality|behaviorProfile|speech|mannerisms","mode":"refine|gradual|explicit|batch","concept":"short stable concept","evidence":"grounded durable-change evidence"}],"canonChanges":[{"field":"appearance|species|background|role|birthday","mode":"refine|change|correction|revelation|age_progression","value":"replacement durable canon","evidence":"grounded scalar-change evidence"}],"background":"","keyRelationships":[],"keyRelationshipChanges":[{"other":"existing NPC name/id","action":"remove","evidence":"explicit durable-tie removal evidence"}],"memories":[],"relationshipSummary":"","mood":"","location":"","goal":"","status":"concrete current activity, situation, or condition; never lifecycle presence","importance":0,"lifeState":"alive|dead|unknown","lifeStateCertainty":"explicit|strong|uncertain","lifeStateReason":"","livingReturn":false,"relationshipChange":{"impact":"none|ordinary|meaningful|major|extreme","delta":{"trust":0,"affection":0,"desire":0,"tension":0},"evidence":"","reason":""}}],"socialEdges":[],"familyFacts":[{"owner":"existing NPC name/id","relation":"daughter|son|child|other countable family role","count":2,"descriptor":"optional e.g. twin daughters","twinGroup":"optional twin label","evidence":"explicit countable family fact"}]}',
        'Emit the machine block even when no NPC changed because an empty inChatNpcIds is meaningful. Do not use markdown fences.'
    );
    return parts.filter(Boolean).join('\n\n');
}


export function injectionDiagnostics(state, settings = {}) {
    const limit = Math.max(1, Math.min(20, Math.round(Number(settings.injectLimit) || 6)));
    const budgetTokens = Math.max(512, Math.min(12000, Math.round(Number(settings.injectBudgetTokens) || 2600)));
    const maxChars = budgetTokens * 4;
    return {
        budgetTokens,
        maxChars,
        dossierBudgetChars: Math.floor(maxChars * 0.68),
        directoryBudgetChars: Math.min(Math.floor(maxChars * 0.20), maxChars - Math.floor(maxChars * 0.68)),
        selectedNpcIds: activeCandidates(state, limit, String(settings.foregroundCurrentUserText || '')).map(npc => npc.id),
        admissionMode: normalizeNpcAdmissionMode(settings.newNpcAdmissionMode),
    };
}
