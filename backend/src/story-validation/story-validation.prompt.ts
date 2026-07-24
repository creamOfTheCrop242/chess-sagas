export const STORY_VALIDATION_PROMPT_VERSION = 'phase-5-v1';

export const STORY_VALIDATION_INSTRUCTIONS = `Validate the supplied story against the complete deterministic chess ledger, narrative analysis, outline, and deterministic findings.

Return structured findings only plus an optional repaired full Markdown story.

Report:
- every missing or invented capture and every wrong captor
- any captured character returning or survivor being killed
- incorrect or missing promotions, checks, checkmate, winner, or ending
- inconsistent permanent names
- board coordinates or chess terminology in reader-facing prose
- important Queen combat lacking either swordplay or magic
- outline setup/payoff or continuity violations

Do not duplicate supplied deterministic findings. Use exact piece IDs and plies in findings, but never add them to prose.

If there are error-severity findings, return the complete repaired story Markdown. Preserve unaffected passages and patch only affected sections. The repair must resolve every error without inventing events. If there are no errors, repairedStoryMarkdown must be null.`;
