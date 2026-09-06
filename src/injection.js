import * as core from './injection-core.js';
import { semanticUpdatePrompt } from './model/semantic-updates.js';

export * from './injection-core.js';

function relevantDossiers(state = {}) {
    const active = new Set([
        ...(state?.lastObservation?.exchangeActiveNpcIds || []),
        ...(state?.lastObservation?.finalPresentNpcIds || []),
        ...(state?.lastObservation?.worldActiveNpcIds || []),
    ]);
    return (state?.npcs || [])
        .filter(npc => !npc.archived)
        .sort((a, b) =>
            Number(Boolean(b.present)) - Number(Boolean(a.present))
            || Number(Boolean(b.worldActive)) - Number(Boolean(a.worldActive))
            || Number(active.has(b.id)) - Number(active.has(a.id))
            || Number(b.importance || 0) - Number(a.importance || 0)
            || Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
        .slice(0, 12);
}

export function buildInjection(state, settings = {}) {
    const base = core.buildInjection(state, settings);
    if (!base || settings.autoScan === false) return base;
    return [
        base,
        semanticUpdatePrompt({ npcs: relevantDossiers(state), mode: 'foreground', allowedSourceIds: [] }),
        'FOREGROUND SOURCE REFERENCES: the current response does not yet have a committed SillyTavern message id while you are generating it. Use sources with messageId:null and exact excerpts from the current visible USER/ASSISTANT exchange. NPC State binds the committed response id locally after generation and rejects excerpts outside the permitted current exchange.',
        'For existing dossiers, semanticUpdates supersedes legacy profileChanges/canonChanges for durable semantic revisions. New dossiers may still bootstrap direct stable fields. Preserve omitted durable information.',
    ].join('\n\n');
}
