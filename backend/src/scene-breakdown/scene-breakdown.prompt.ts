export const SCENE_BREAKDOWN_PROMPT_VERSION = 'phase-6-v2';
export const SCENE_BREAKDOWN_INSTRUCTIONS = `Split the validated cohesive story into move-aligned playback scenes. Return structured JSON only.

- Create exactly one playback scene for every ledger ply. Never group multiple plies into one scene.
- Every scene must have startPly equal to endPly and cover exactly one move.
- Cover every ledger ply exactly once with chronological, contiguous scenes.
- involvedMoves must contain exactly the one SAN string for that scene's ply.
- Quiet moves still need their own distinct narrative beat, focused on movement, positioning, tension, preparation, or consequence without inventing combat.
- fantasyNarration must be an excerpt or faithful localized adaptation of the validated story, not a new contradictory story.
- Use piece IDs only in structured character, death, and promotion arrays; never expose them in fantasyNarration.
- deaths must exactly list capturedPieceId values within the scene.
- promotions must exactly list promoting pieceId values within the scene.
- Preserve all survivors, captors, winner, termination, names, wounds, and visual continuity.
- visualPrompt and videoPrompt must describe only this scene and preserve established character appearances.
- estimatedDurationSeconds should match narration/action density.`;
