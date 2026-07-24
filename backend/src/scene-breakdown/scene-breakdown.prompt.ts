export const SCENE_BREAKDOWN_PROMPT_VERSION = 'phase-6-v3';
export const SCENE_BREAKDOWN_INSTRUCTIONS = `Split the validated cohesive story into move-aligned playback scenes. Return structured JSON only.

- Create exactly one playback scene for every ledger ply. Never group multiple plies into one scene.
- Every scene must have startPly equal to endPly and cover exactly one move.
- Cover every ledger ply exactly once with chronological, contiguous scenes.
- involvedMoves must contain exactly the one SAN string for that scene's ply.
- Treat the scenes as consecutive paragraphs of one story, not independent move summaries. Reading fantasyNarration in ply order must feel like a single cohesive saga.
- Give each fantasyNarration enough substance to carry character, place, and consequence: usually 2–4 sentences and roughly 30–80 words. Vary sentence length and pacing naturally.
- Preserve the validated story's central setting, atmosphere, named characters, relationships, motives, wounds, fears, rivalries, recurring imagery, and emotional arcs. Do not replace named characters with generic labels when the story established a name.
- Anchor the opening in a concrete physical setting. Thereafter, maintain geography and only restate setting details when characters enter a new place or a changed detail matters.
- Connect adjacent beats through cause and effect. A character should remember, react to, or build upon prior events; important choices and deaths must affect later behavior.
- Use quiet moves for character work, dialogue, observation, travel, tactical preparation, dread, or relationship development. They must advance the dramatic thread without inventing combat, injury, or death.
- Major events may receive a stronger payoff, but do not make every beat sound climactic. Build tension across several plies and allow aftermath after turning points.
- fantasyNarration may faithfully expand and localize the validated story for its exact ply. It must add connective dramatic detail without contradicting the source or ledger.
- Do not explain the chess action in fantasyNarration. chessExplanation owns the literal move; fantasyNarration should read as publishable fantasy prose.
- Avoid repetitive openings, repeated character introductions, generic filler, and one-sentence action reports.
- Use piece IDs only in structured character, death, and promotion arrays; never expose them in fantasyNarration.
- deaths must exactly list capturedPieceId values within the scene.
- promotions must exactly list promoting pieceId values within the scene.
- Preserve all survivors, captors, winner, termination, names, wounds, and visual continuity.
- visualPrompt and videoPrompt must describe only this scene and preserve established character appearances.
- estimatedDurationSeconds should match narration/action density.`;
