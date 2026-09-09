const RELATIONSHIP_PRESENTATION_TAGS = '(?:font|span|b|strong|i|em|u|s|strike|small|big|mark|sub|sup)';
const RELATIONSHIP_PRESENTATION_TAG_RE = new RegExp(`<\\/?${RELATIONSHIP_PRESENTATION_TAGS}\\b[^<>]*>`, 'giu');
const RELATIONSHIP_PRESENTATION_BREAK_RE = /<br\b[^<>]*\/?\s*>/giu;

function relationshipPresentationComparable(value) {
    return String(value ?? '')
        // SillyTavern/preset presentation markup is not narrative evidence. Strip only a
        // small allowlist of formatting tags so an exact quotation may cross a closing
        // <font>/<span>/style tag into adjacent narration. Deliberately leave custom and
        // structural tags (for example <Blocks>) intact so formatting normalization cannot
        // bridge evidence across visibility/control boundaries.
        .replace(RELATIONSHIP_PRESENTATION_BREAK_RE, ' ')
        .replace(RELATIONSHIP_PRESENTATION_TAG_RE, ' ');
}

function relationshipQuoteComparable(value, max = 40000) {
    return relationshipPresentationComparable(value)
        .normalize('NFKC')
        .replace(/\r\n?/g, '\n')
        .replace(/[“”„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'")
        .replace(/[‐‑‒–—―]/g, '-')
        .replace(/\u00a0/g, ' ')
        .replace(/[*_\x60]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
        .toLocaleLowerCase()
        .slice(0, max);
}

function quotedDialogueSegments(value) {
    // Use the same presentation-only normalization as exact excerpt matching. Quote marks
    // remain in place, so stripping <font>/<span> wrappers does not turn dialogue into
    // narration or allow a cross-boundary excerpt to count as wholly quoted speech.
    const text = relationshipPresentationComparable(value);
    const out = [];
    let start = -1;
    let close = '';
    const closesFor = char => ({ '"': '"', '“': '”', '„': '”', '«': '»', '‘': '’' }[char] || '');
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (start >= 0) {
            if (char === close) {
                out.push(text.slice(start, index));
                start = -1;
                close = '';
            }
            continue;
        }
        const expected = closesFor(char);
        if (expected) {
            start = index + 1;
            close = expected;
        }
    }
    return out;
}

function wholeQuotedExcerptInterior(excerpt) {
    const text = relationshipPresentationComparable(excerpt).trim();
    if (!text) return '';
    const close = ({ '"': '"', '“': '”', '„': '”', '«': '»', '‘': '’' })[text[0]] || '';
    if (!close || text.at(-1) !== close) return '';
    return relationshipQuoteComparable(text.slice(1, -1), 1200);
}

function excerptInsideQuotedDialogue(excerpt, sourceText) {
    const quote = relationshipQuoteComparable(excerpt, 1200);
    if (!quote) return false;
    // quotedDialogueSegments() intentionally returns the content between delimiters. Model
    // excerpts may preserve or add harmless outer quote marks around a verbatim slice, so
    // compare both the literal form and a safely unwrapped whole-quote interior. A mixed
    // dialogue-to-narration excerpt is not one whole quoted slice and therefore cannot use
    // this path.
    const wholeQuotedInterior = wholeQuotedExcerptInterior(excerpt);
    const candidates = [...new Set([quote, wholeQuotedInterior].filter(Boolean))];
    return quotedDialogueSegments(sourceText).some(segment => {
        const comparable = relationshipQuoteComparable(segment, 40000);
        return candidates.some(candidate => comparable.includes(candidate));
    });
}

export function relationshipEvidenceExcerptMatch(excerpt, sources = []) {
    const quote = relationshipQuoteComparable(excerpt, 1200);
    if (!quote) return null;
    const wholeQuotedInterior = wholeQuotedExcerptInterior(excerpt);
    for (const raw of Array.isArray(sources) ? sources.slice(0, 8) : []) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const sourceText = String(raw.text || '');
        const source = relationshipQuoteComparable(sourceText, 40000);
        if (!source) continue;
        const directMatch = source.includes(quote);
        // A model may quote only a verbatim prefix/middle/suffix of a longer spoken line and
        // add its own closing quote delimiter. Treat those outer delimiters as presentation
        // only when the unwrapped interior is still an exact substring of ONE quoted-dialogue
        // segment in this same permitted source. Never stitch across dialogue segments or
        // fall back to narration, and never relax the exact interior text itself.
        const quotedSliceMatch = !directMatch && Boolean(wholeQuotedInterior) && quotedDialogueSegments(sourceText).some(segment =>
            relationshipQuoteComparable(segment, 40000).includes(wholeQuotedInterior));
        if (!directMatch && !quotedSliceMatch) continue;
        return {
            sourceId: String(raw.id || 'relationship-source').trim().slice(0, 80),
            kind: ['visible', 'inner'].includes(String(raw.kind || '').trim()) ? String(raw.kind).trim() : 'visible',
            sourceRole: ['user', 'assistant'].includes(String(raw.role || '').trim()) ? String(raw.role).trim() : '',
            insideQuotedDialogue: quotedSliceMatch || excerptInsideQuotedDialogue(excerpt, sourceText),
        };
    }
    return null;
}
