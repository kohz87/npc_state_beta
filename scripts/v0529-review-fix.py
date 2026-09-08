from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src' / 'scan-application.js'
text = path.read_text()

old = """                    const identityEvidenceExcerpts = identityEvidenceAccepted && Array.isArray(identityRecord?.excerpts)
                        ? identityRecord.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)
                        : [];
                    return {
"""
new = """                    const identityEvidenceExcerpts = identityEvidenceAccepted && Array.isArray(identityRecord?.excerpts)
                        ? identityRecord.excerpts.map(value => String(value || '').trim()).filter(Boolean).slice(0, 3)
                        : [];
                    const canonicalIdentity = canonicalPatchName(patch, []);
                    const worldStateCanonicalEnrichmentAccepted = Boolean(identityEvidenceAccepted
                        && canonicalIdentity
                        && !containsNormalizedPhrase(currentVisibleText, canonicalIdentity)
                        && worldStateCanonicalIdentityMention(patch, evidencePolicy));
                    return {
"""
if text.count(old) != 1:
    raise SystemExit(f'first context-plumbing anchor mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

old = """                        identityEvidenceAccepted,
                        identityEvidenceExcerpts,
                        identityEvidenceBindings: identityEvidenceExcerpts.map(uniquelyOwnedRelationshipExcerptBinding).filter(Boolean),
"""
new = """                        identityEvidenceAccepted,
                        worldStateCanonicalEnrichmentAccepted,
                        identityEvidenceExcerpts,
                        identityEvidenceBindings: identityEvidenceExcerpts.map(uniquelyOwnedRelationshipExcerptBinding).filter(Boolean),
"""
if text.count(old) != 1:
    raise SystemExit(f'second context-plumbing anchor mismatch: {text.count(old)}')
text = text.replace(old, new, 1)

path.write_text(text)
print('Applied v0.5.29 review correction to scan-application.js.')
