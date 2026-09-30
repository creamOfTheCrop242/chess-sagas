# Reliability baseline — 2026-09-12

This is a debugging baseline, not a production reliability claim. A targeted local
validator fix was implemented on 2026-09-15. No paid generation calls are needed
to replay these cases.

## Evidence

Read-only inspection of the six most recent retained failed GenerationRun records:

- Four narrative-analysis failures explicitly report API credit exhaustion (429).
  These are provider-account failures, not story-quality failures.
- v97 run `cmtrksh5c00090yxqyyg0mzrx` reports an ownership transfer in a sentence
  describing Gideon holding his abdomen while Evander advances. Suspected false
  positive; not yet replayed with that run's full inputs.
- v111 run `cmtyog7qd00092xuquc68cm77` ends after two wound repairs. Its terminal
  logs include the original flagged excerpts and rejected replacements.

The sample contains only retained FAILED stage runs, across different versions.
It is not a denominator for saga failure rate and may omit deleted history.

## Reproduced defects

`reliability-v111.json` contains a reduced saved ledger and analysis wound plans.
The tests use exact excerpts from terminal logs, not reconstructed full scenes.
The original generated wound package and full repair responses were not retained
in GenerationRun.options; exact whole-run replay is therefore unavailable.

1. Percival has an impaired-eye wound authorized at ply 21. The ownership checker
   calls the quoted eye injury Nessa's instead. There IS already a target-own-wound
   exemption; it depends on `highConfidenceWoundSignature`, so simply adding another
   "check own contract first" instruction would duplicate existing intent.
2. At final mate, the sentence describing Seal failure and stopped Fortresses is
   classified as substantive physical damage to Northeast Fortress. The unplanned
   injury check does not distinguish that authorized terminal power state here.
3. A replacement explicitly saying fortress engines remain operational and intact
   is ALSO classified as damaged. This shows a wider sentence attribution problem,
   not just a missing exception for the word "stopped". This sentence is only valid
   with respect to the damage check: operational Southern/Northern equipment after
   its own Seal fails must still be assessed by the separate power-state check.

The second repair also introduced genuine errors: spear thrust instead of the
contracted projectile death and omission of Percival's eye injury. The existing
repair-obligation checker rejected these correctly. Do not remove that safeguard.

## Offline command and interpretation

From backend: `npm test -- --runInBand reliability-regressions.spec.ts`

The three original `it.failing` cases were converted to ordinary passing assertions
on 2026-09-15. Weapon anatomy is excluded from bodily signature matching; the
target's catalog body area and supported injury families inform compatibility.
Fortress damage now retains matched evidence and uses clause-local ownership and
negation. The existing power-state check and repair loops were left unchanged.

Negative controls require actual wound swapping, actual hull damage, explicit eye
removal under an impaired-eye contract, and premature power loss to remain
detectable. Mixed intact/damaged components and negated damage are covered too.
These results verify the retained cases, not a measured live completion rate.

## Next implementation gates

1. Resolve contract-equivalence versus phrase-signature matching for the eye case,
   without treating every injury to the same body part as authorized.
2. Resolve damage recipient and polarity at clause level; distinguish terminal
   depowering from physical damage. Do not simply exempt an entire mate scene,
   or every sentence containing "intact".
3. Only then evaluate contextual AI adjudication for the remaining ambiguities.
   No new AI adjudication call or retry loop has been added by this audit.
4. Preserve bounded original/repair scene snapshots, contract identifiers, and
   findings in future telemetry before claiming whole-run replay coverage.

## Paid batch protocol (not executed)

Freeze a commit and configuration. Use a fixed, legally parsed PGN set covering
short mate, long mate, resignation, promotion, and Fortress-heavy combat. Record
first-pass validity, completion, false-positive adjudications, repair success and
regressions separately, plus end-to-end time and ALL call costs. Human-review the
same factual checklist for each output. Do not pool different code versions or
count successful API calls as successfully validated sagas. Agree a spend cap
before running a paid batch; no additional live generations were started here.
