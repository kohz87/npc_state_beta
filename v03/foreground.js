import { parseScanJson } from './scanner.js';

const OPEN = /<npc_state_v1\b[^>]*>/i;
const COMPLETE_BLOCK = /<npc_state_v1\b[^>]*>[\s\S]*?<\/npc_state_v1\s*>/gi;
const INVENTORY_TAIL = /(?:<!--\s*(?:INVENTORY_BLOCK_UPDATE|INVENTORY_BLOCK_V05)\b[\s\S]*$|<Inventory\b[\s\S]*$)/i;

function tidy(value) { return String(value ?? '').replace(/\n{3,}/g, '\n\n').trimEnd(); }

function removeTruncatedTail(source) {
    const open = OPEN.exec(source);
    if (!open) return source;
    const tailSource = source.slice(open.index);
    const inventory = INVENTORY_TAIL.exec(tailSource);
    const tail = inventory ? tailSource.slice(inventory.index) : '';
    return tidy(source.slice(0, open.index) + (tail ? '\n\n' + tail : ''));
}

export function consumeNpcStateControl(messageText) {
    const source = String(messageText ?? '');
    const blocks = [...source.matchAll(new RegExp(COMPLETE_BLOCK.source, 'gi'))];
    const firstOpen = OPEN.exec(source);
    if (!blocks.length && !firstOpen) return { found: false, cleanedText: source, parsed: null, raw: '', errors: [] };

    const errors = [];
    if (!blocks.length) {
        return {
            found: true,
            cleanedText: removeTruncatedTail(source),
            parsed: null,
            raw: source.slice(firstOpen.index),
            errors: ['NPC State foreground block was truncated or missing its closing tag.'],
        };
    }

    if (blocks.length > 1) errors.push('Multiple NPC State foreground blocks were emitted; update rejected.');
    const raw = blocks[0][0];
    const open = /<npc_state_v1\b[^>]*>/i.exec(raw);
    const close = /<\/npc_state_v1\s*>/i.exec(raw);
    const body = raw.slice((open?.index || 0) + (open?.[0]?.length || 0), close?.index ?? raw.length).trim();

    let cleanedText = tidy(source.replace(new RegExp(COMPLETE_BLOCK.source, 'gi'), ''));
    if (OPEN.test(cleanedText)) {
        errors.push('A truncated extra NPC State foreground block was emitted; update rejected.');
        cleanedText = removeTruncatedTail(cleanedText);
    }

    let parsed = null;
    if (!errors.length) {
        try { parsed = parseScanJson(body); }
        catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    return { found: true, cleanedText, parsed, raw, errors };
}
