export const SCENE_BREAKDOWN_PROMPT_VERSION = 'phase-6-v1';
export const SCENE_BREAKDOWN_INSTRUCTIONS = `Split the validated cohesive story into move-aligned playback scenes. Return structured JSON only.

- Cover every ledger ply exactly once with chronological, contiguous scenes.
- A scene may group related quiet moves; major captures, checks, checkmate, and promotions deserve focused scenes.
- involvedMoves must contain the exact SAN strings for every ply in the scene, in order.
- fantasyNarration must be an excerpt or faithful localized adaptation of the validated story, not a new contradictory story.
- Use piece IDs only in structured character, death, and promotion arrays; never expose them in fantasyNarration.
- deaths must exactly list capturedPieceId values within the scene.
- promotions must exactly list promoting pieceId values within the scene.
- Preserve all survivors, captors, winner, termination, names, wounds, and visual continuity.
- visualPrompt and videoPrompt must describe only this scene and preserve established character appearances.
- estimatedDurationSeconds should match narration/action density.`;
