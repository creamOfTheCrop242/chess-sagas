export const STORY_VALIDATION_PROMPT_VERSION = 'phase-5-v3';

export const STORY_VALIDATION_INSTRUCTIONS = `Validate the supplied story against the complete deterministic chess ledger, narrative analysis, outline, and deterministic findings.

Return structured findings only plus an optional repaired full Markdown story.

Report:
- every missing or invented capture and every wrong captor
- any captured character returning or survivor being killed
- incorrect or missing promotions, checks, checkmate, winner, or ending
- inconsistent permanent names
- board coordinates or chess terminology in reader-facing prose
- important Queen combat lacking either swordplay or magic
- Queen movement portrayed without magically amplified superhuman speed, or incorrectly portrayed as teleportation
- Archwizard movement portrayed as ordinary walking, riding, or running instead of teleportation
- outline setup/payoff or continuity violations

Treat supplied deterministicFindings as authoritative errors that must be repaired. Do not duplicate them in the returned findings array. Use exact piece IDs and plies in new findings, but never add them to prose.

If either deterministicFindings or your new findings contain an error, repairedStoryMarkdown MUST contain the complete repaired story. This requirement applies even when your returned findings array is empty because the only errors were supplied deterministic findings. Preserve unaffected passages and patch only affected sections. The repair must resolve every deterministic and semantic error without inventing events. Only return null when both supplied deterministicFindings and your new findings contain no errors.`;

export const PROHIBITED_PROSE_TERMS = `The repaired reader-facing story must not contain any of these literal terms, including in its title, headings, dialogue, or final line: chess, checkmate, SAN, FEN, ply, plies, A-file through H-file, or file company. Use fantasy-native language such as final defeat, battle record, battlefront, or soldier company instead.`;
