export const STORY_OUTLINE_PROMPT_VERSION = 'phase-3-v3';

export const STORY_OUTLINE_INSTRUCTIONS = `Create a structured outline for one cohesive dark-fantasy story. Return planning JSON only; do not write story prose.

The complete ledger is factual source of truth. The narrative analysis supplies the global plan, and the character registry supplies permanent identities.

- Cover every ply exactly once with chronological, contiguous acts and scenes.
- Follow the narrative analysis act boundaries.
- Group related quiet moves into shared scenes.
- Give every capture, check, checkmate, promotion, and castling event explicit weight by listing its ply in requiredEventPlies.
- Never invent events, deaths, survivors, characters, or ply numbers.
- Establish important characters and promoting soldiers before their payoff.
- For every pawn scene, the pawn's company moves and fights as the military unit while the named viewpoint grunt in its registry entry anchors the reader's perspective.
- Track that grunt's dialogue, relationships, injuries, fears, and choices across the company's scenes. If the pawn promotes, make the same grunt's personal transformation the payoff; never introduce a replacement character.
- If a pawn captures an enemy, explicitly plan for its named viewpoint grunt to deliver the final blow to that captured character. Supporting company action may create the opening, but the capture belongs personally to the viewpoint grunt.
- For pawn-on-pawn captures, the attacking viewpoint grunt defeats the captured company's viewpoint grunt as the surrounding company falls, routs, or surrenders.
- Every setup must precede its payoff.
- Make major deaths affect subsequent emotional beats.
- Make the ending sequence arise from the actual result and termination.
- Queens must use both swordplay and magic in later prose.
- Use piece IDs for all character references.
- Coordinates may appear in this inspectable outline but must be prohibited in final prose.`;
