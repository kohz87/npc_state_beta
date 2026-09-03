# NPC State 0.4.1 remaining live lifecycle tests

Static CI can prove parser/apply/storage invariants, but SillyTavern event ordering still needs live confirmation for these cases:

- Continue appending to the same assistant message: confirm a continuation does not replay an earlier relationship delta from the same exchange.
- Rapid edit/swipe/delete while foreground processing is queued: confirm stale-operation guards discard the old payload and branch reconciliation wins.
- Swipe deletion that renumbers `swipe_id`: confirm SillyTavern's event order and stored swipe metadata restore the surviving variant without a false rebase.
- Mid-history edit/delete with later surviving messages: confirm deterministic rollback restores the correct checkpoint, then document that relationship deltas from intermediate surviving turns are not reconstructed from history.
- Inventory Block v0.5.3 foreground coexistence: confirm both MESSAGE_RECEIVED handlers can normalize their own transports without overwriting the other's live `message.mes` mutation.

These are deliberately not treated as reasons to invent a larger transaction architecture until a live failure is reproduced.
