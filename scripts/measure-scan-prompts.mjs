import { buildScanPrompt, buildTargetedRefreshPrompt, SCAN_SYSTEM_PROMPT } from '../src/scanner.js';
import { createEmptyState, normalizeNpc } from '../src/schema.js';
import { estimateForegroundTokens, FOREGROUND_TOKEN_ESTIMATE_METHOD } from '../src/foreground-budget.js';

const size = prompt => ({
    chars: prompt.length + SCAN_SYSTEM_PROMPT.length,
    estTokens: estimateForegroundTokens(prompt) + estimateForegroundTokens(SCAN_SYSTEM_PROMPT),
    promptChars: prompt.length,
    promptEstTokens: estimateForegroundTokens(prompt),
});

function stateWith(npcs) {
    const state = createEmptyState('chat:measure');
    state.npcs = npcs.map(normalizeNpc);
    return state;
}

function baseNpc(id, name, extra = {}) {
    return {
        id, name, present: true, role: 'Guild clerk', species: 'Human',
        appearance: 'A plainly dressed frontier clerk.', personality: 'Practical and attentive.',
        speech: 'Brief professional speech.', behaviorProfile: ['Keeps work moving efficiently.'],
        mannerisms: ['Checks written entries twice.'], mood: 'Focused.', location: 'Rimecross guild desk',
        goal: 'Process registrations', status: 'Working at the counter',
        relationship: { trust: 0, affection: 0, desire: 0, tension: 0 },
        relationshipSummary: 'Professional first-contact dynamic.',
        ...extra,
    };
}

export function scanPromptMeasurementMatrix() {
    const cases = [];
    {
        const state = stateWith([{ id: 'vrena', name: 'Vrena Tolk', present: true, speech: 'Formal.' }]);
        const chat = [{ is_user: true, name: 'Ari', mes: 'I ask what to sign.' }, { is_user: false, mes: 'Vrena Tolk answers with clipped practical instructions.' }];
        cases.push(['minimal-one-npc', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const state = stateWith([]);
        const chat = [{ is_user: true, name: 'Ari', mes: 'I approach the registration desk and ask for field work.' }, { is_user: false, mes: 'Vrena Tolk, a slender young woman in a wool waistcoat over ink-stained linen sleeves, catches the ledger before it slides. “Name first. Then the south-trail form.” She taps the signature line with a carved bone bodkin and waits with her arms crossed behind the Rimecross Adventurer Guild counter.' }];
        cases.push(['rich-first-encounter', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const npcs = [baseNpc('vrena', 'Vrena Tolk'), baseNpc('sora', 'Sora', { role: 'Dependent', species: 'Stormcrown Thunderbird Chimera', speech: 'Bright, proud speech.' }), baseNpc('ryu', 'Ryu', { role: 'Dependent', species: 'Silver Dragon Chimera', speech: 'Measured analytical speech.' }), baseNpc('mirel', 'Mirel', { present: false, worldActive: false, role: 'Healer' })];
        const state = stateWith(npcs);
        const chat = [{ is_user: true, name: 'Lucien', mes: 'I ask Vrena to show Sora and Ryu the route, and mention Mirel may join us later.' }, { is_user: false, mes: 'Vrena points out the lower road. Sora hops onto the step and boasts that she can scout ahead; Ryu quietly corrects the distance and folds the map. Mirel is only mentioned as still being at the hospice.' }];
        cases.push(['three-active-plus-mentioned', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const npc = baseNpc('vrena', 'Vrena Tolk', { profileEvolutionEvidence: [
            { field: 'speech', kind: 'observation', mode: 'gradual', concept: 'Clipped practical replies', evidence: '“Name first.”', sourceEventKey: 'chat:1', sourceMessageId: 1, turn: 1, at: 1 },
            { field: 'mannerisms', kind: 'observation', mode: 'gradual', concept: 'Taps paperwork to direct attention', evidence: 'She taps the signature line.', sourceEventKey: 'chat:3', sourceMessageId: 3, turn: 2, at: 2 },
        ] });
        const state = stateWith([npc]);
        const chat = [{ is_user: true, name: 'Ari', mes: 'I return with the corrected form.' }, { is_user: false, mes: 'Vrena reads it once, says “Better. Sign there,” and taps the final line twice.' }];
        cases.push(['observation-development', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const npc = baseNpc('vrena', 'Vrena Tolk', {
            appearance: 'A lean frontier guild clerk with dark hair pinned up, practical workwear, and ink-stained hands.',
            appearanceForms: [{ name: 'Human', appearance: 'Lean human woman with dark hair pinned up and practical workwear.' }, { name: 'Winter field kit', appearance: 'Heavy wool cloak, gloves, and snow gaiters.' }, { name: 'Ceremonial', appearance: 'Formal guild coat and pinned hair.' }], currentForm: 'Human',
            behaviorProfile: Array.from({ length: 8 }, (_, i) => `Behavior pattern ${i + 1}: concise grounded work habit.`),
            mannerisms: Array.from({ length: 8 }, (_, i) => `Mannerism ${i + 1}: distinct grounded gesture.`),
            memories: Array.from({ length: 5 }, (_, i) => `Important memory ${i + 1}: durable event with Ari.`),
            keyRelationships: Array.from({ length: 12 }, (_, i) => `NPC ${i + 1}: grounded professional tie.`),
            manualProfileFields: ['personality', 'appearance'],
            profileEvolutionEvidence: Array.from({ length: 6 }, (_, i) => ({ field: i % 2 ? 'speech' : 'mannerisms', kind: i % 3 ? 'observation' : 'applied', mode: 'gradual', concept: `concept ${i}`, evidence: `Grounded observation excerpt ${i} with useful detail.`, sourceEventKey: `event-${i}`, sourceMessageId: i, turn: i, at: i + 1 })),
        });
        const state = stateWith([npc]);
        const chat = [{ is_user: true, name: 'Ari', mes: 'I ask whether her field kit has changed.' }, { is_user: false, mes: 'Vrena rolls down her sleeves and replaces the old wool cloak with a waxed rain cape before checking the trail ledger.' }];
        cases.push(['dense-collections-locks-forms', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const state = stateWith([baseNpc('vrena', 'Vrena Tolk')]);
        const long = Array.from({ length: 350 }, (_, i) => `Paragraph ${i + 1}: Vrena and Ari work through a difficult frontier registration detail while preserving exact chronology and concrete visible evidence.`).join('\n');
        const chat = [{ is_user: true, name: 'Ari', mes: 'I ask Vrena to review the entire incident carefully.' }, { is_user: false, mes: long }];
        cases.push(['long-current-response', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const npcs = [baseNpc('vrena', 'Vrena Tolk')];
        for (let i = 0; i < 999; i += 1) npcs.push({ id: `off-${i}`, name: `Offscreen ${i}`, present: false, worldActive: false, role: 'Distant resident', status: 'Elsewhere' });
        const state = stateWith(npcs);
        const chat = [{ is_user: true, name: 'Ari', mes: 'I ask Vrena what to sign.' }, { is_user: false, mes: 'Vrena Tolk points to the signature line and answers with clipped practical instructions.' }];
        cases.push(['large-db-one-relevant', buildScanPrompt({ state, chat, assistantMessageId: 1 })]);
    }
    {
        const state = stateWith([baseNpc('vrena', 'Vrena Tolk')]);
        const chat = [{ is_user: true, name: 'Ari', mes: '<Blocks><World_State>NPCs Present: Vrena Tolk | Rimecross desk</World_State></Blocks>\nI ask what to sign.' }, { is_user: false, mes: 'Vrena taps the line. <Blocks><NPC_Inner_Chatter>Vrena wants the paperwork finished before dusk.</NPC_Inner_Chatter></Blocks>' }];
        cases.push(['structured-plus-custom', buildScanPrompt({ state, chat, assistantMessageId: 1, relationshipCriteria: 'Treat formal frontier obligations as weak evidence unless the scene explicitly changes personal reliance.', memoryCriteria: 'Keep promises, rescues, durable gifts, major cruelty, and lasting obligations. Exclude routine paperwork.' })]);
        cases.push(['targeted-refresh', buildTargetedRefreshPrompt({ npc: state.npcs[0], chat, assistantMessageId: 1, scanDepth: 12, memoryCriteria: 'Keep promises, rescues, durable gifts, major cruelty, and lasting obligations.' })]);
    }
    return cases.map(([name, prompt]) => ({ name, prompt, ...size(prompt) }));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    for (const row of scanPromptMeasurementMatrix()) console.log(JSON.stringify({ name: row.name, chars: row.chars, estTokens: row.estTokens, promptChars: row.promptChars, promptEstTokens: row.promptEstTokens }));
    console.error(`estimator ${FOREGROUND_TOKEN_ESTIMATE_METHOD}; systemChars ${SCAN_SYSTEM_PROMPT.length}; systemTokens ${estimateForegroundTokens(SCAN_SYSTEM_PROMPT)}`);
}
