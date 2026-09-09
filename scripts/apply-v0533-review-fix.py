from pathlib import Path

engine = Path('src/engine.js')
s = engine.read_text(encoding='utf-8')
old = """                    } catch (error) {
                        if (signal?.aborted) {
                            finishDiscardedOperation(operationId, 'scan-cancelled', 'first-contact-completion');
                            return { ok: false, discarded: true, reason: 'scan-cancelled', messageId };
                        }
                        const reason = String(error?.message || error).slice(0, 300);
"""
new = """                    } catch (error) {
                        const failedCompletionChat = getContext().chat || [];
                        if (signal?.aborted || !operationOwnershipMatches(ownership) || (expectedSource && !sourceDescriptorMatches(expectedSource, chatKey, failedCompletionChat, messageId))) {
                            finishDiscardedOperation(operationId, signal?.aborted ? 'scan-cancelled' : 'stale-operation', 'first-contact-completion-failed');
                            return { ok: false, discarded: true, reason: signal?.aborted ? 'scan-cancelled' : 'stale-operation', messageId };
                        }
                        const reason = String(error?.message || error).slice(0, 300);
"""
if s.count(old) != 1:
    raise SystemExit(f'engine ownership catch match count {s.count(old)}')
engine.write_text(s.replace(old, new), encoding='utf-8')

tests = Path('tests/v0533-optional-first-contact-recheck.test.mjs')
t = tests.read_text(encoding='utf-8')
anchor = "test('manual Recheck missing details is current-exchange-only and isolated from focused state channels'"
if t.count(anchor) != 1:
    raise SystemExit(f'manual recheck anchor count {t.count(anchor)}')
regression = r'''test('follow-up provider failure after edit, swipe, or chat change discards stale first-pass state', async t => {
  for (const kind of ['edit','swipe','chat']) await t.test(kind, () => withHost(async h => {
    h.context.chat = structuredClone(chat);
    let calls = 0;
    h.context.generateRaw = async () => {
      h.metrics.generations += 1; calls += 1;
      if (calls === 1) return JSON.stringify(firstPayload());
      if (kind === 'edit') h.context.chat[1].mes += ' edited-before-failure';
      if (kind === 'swipe') h.context.chat[1].swipe_id = 2;
      if (kind === 'chat') h.context.chatId = 'other-chat-before-failure';
      throw new Error('provider failed after ownership changed');
    };
    const result = await h.entry.processCompletedAssistantResponse(1);
    assert.equal(result.discarded, true);
    assert.equal(result.reason, 'stale-operation');
    assert.equal(h.persisted().npcs.length, 0);
    assert.equal(h.metrics.posts, 0);
  }, { state: createEmptyState('chat:actor.png:fixture'), settings: { firstContactFollowUpMode: 'missing_evaluations' } }));
});

'''
tests.write_text(t.replace(anchor, regression + anchor, 1), encoding='utf-8')
