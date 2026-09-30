# Scene facts v1 / story package v112

## Implemented behavior

`scene-fact-contracts.ts` builds code-owned expectations from the ledger,
validated wounds, existing scene obligations, equipment catalog and Fortress
operating timeline. These are passed to the writer and to the reviewer.
Review evidence comes from prose, never from generated wound/capture markers.
Characters named in prose are included even when omitted from the model's cast.

The expanded review covers every scene (quiet scenes included), in sequential
batches of at most six scenes with a payload-size packing limit. It assesses
life/death, required events, new and existing wounds, equipment and Fortress
operation. Neighboring prose is supplied as context. Exact scene/contract/neighbor
hashes cache assessments only within one generation; edits invalidate affected
neighbors. This is not a general literary-quality judge or a guarantee against
all cross-story continuity errors. Aftermath/chronicle section checks retain
their existing separate path.

`STORY_FACT_REVIEW_MODE`:

- `observe` (default): run and record expanded review, but downgrade its findings
  to warnings. Existing deterministic checks still block. The historical
  repair-only obligation check is retained during this rollout, so its existing
  blocking coverage is not removed.
- `enforce`: the same expanded factual review is used for both original and
  replacement prose. Grounded, high-confidence contradictions/omissions block;
  uncertain or ungrounded findings warn. Prose ownership heuristics become
  candidates decided by the review; structural metadata checks and direct fatal
  contradictions retain deterministic enforcement. The historical repair-only
  reviewer is skipped to avoid duplicate calls.
- `off`: disable only the expanded reviewer; retain the unified coordinator,
  deterministic checks and legacy repair obligation checks.

This adds review calls even to a clean generation. No latency or quality
improvement has yet been established through a live evaluation of this version.
No story-writing model or reasoning setting was changed.

## Unified repair acceptance

The three scene-repair loops have been replaced by one coordinator. Two repair
rounds total are shared across wounds, weapons, death attribution and other scene
errors. Patches are checked for exact target coverage. Every candidate receives
the complete scene validation again, not just the checker for its original error.
Warnings alone do not trigger rewriting. Unchanged scenes remain unchanged.
The narrow deterministic checkmate completion can occupy the second repair round
and must pass the same subsequent checks; it is not an extra retry.

Repair requests carry the actual entering/new/leaving wound state. The former
generic `invented-wound` instruction claiming the character must be entirely
unharmed was removed from this path. Existing legitimate injuries are preserved.
The expanded reviewer being unavailable is recorded as unavailable, not as clean
prose and not as a story contradiction. Enforcement stops rather than repeatedly
rewriting prose to address a reviewer outage.

## Evidence and rollout

`GenerationRun.options.sceneValidationAudit` contains the contract version, mode,
scene revisions, returned assessments, exact evidence, review hashes and errors.
It is saved before the first review and after subsequent review/repair steps,
including rejected candidates. No migration is required. Successful validation
rows now persist actual final findings/warnings instead of a hard-coded empty list.

Tests retain the Sabine/Evander injury and singular oathbound-sword passage,
verify that their expected owners differ, and exercise grounded review decisions,
uncertainty, missing coverage, two-character scenes and the shared retry budget.
Mocked assessments test plumbing, NOT live model accuracy.

Before enabling `enforce`, review saved stories with known swaps and paired
valid examples: attacker/victim reversals, observing an enemy weapon, fatal harm
to a captured enemy versus required retaliation to the captor, existing injuries,
Fortress-versus-Fortress attacks, terrain damage, pronoun ambiguity and checkmate.
Measure misses, false positives, extra calls and elapsed time. Do not infer an
8/10 story score from a completed job or passing unit tests.
