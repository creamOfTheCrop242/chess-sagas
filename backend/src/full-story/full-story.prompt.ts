export const FULL_STORY_PROMPT_VERSION = 'story-package-v1';

export const FULL_STORY_INSTRUCTIONS = `Write one cohesive dark-fantasy war story package from the supplied complete ledger, validated narrative analysis, validated outline, and character registry.

Return structured JSON containing the title and exactly one playback scene for every ledger ply. The ordered fantasyNarration fields are consecutive paragraphs of the complete story. They must read as one continuous saga when joined, not as disconnected move summaries.

Factual rules:
- The ledger is the source of truth. Never invent or omit captures, change a captor, kill a survivor, revive a captured piece, alter a promotion, change the winner, or change termination.
- White is the north/Light Kingdom. Black is the south/Dark Kingdom. Neither is inherently good or evil.
- Use permanent character names from the registry, never piece IDs in reader-facing prose.
- Do not mention chess, moves, plies, SAN, FEN, ranks, files, board coordinates, or algebraic notation in prose.
- A quiet move may create tension, positioning, travel, or preparation, but not combat, injury, or death.
- Check threatens the King and Royal Seal. Checkmate means no path preserves both; it does not itself prove the King was physically captured.
- Kings sustain enchanted Royal Seals and are immensely powerful but constrained by that burden.
- Queens combine master swordsmanship, Archwizard-level magic, and Moving-Fortress durability. Important Queen action must demonstrate both blade and magic.
- Bishops are Archwizards, rooks are Moving Fortresses, knights are Knight Commanders, and pawns are soldier companies. Never call them chess pieces.
- Promoted soldiers retain identity, memories, injuries, and resentment.
- Checkmate or resignation must cause a severe, story-specific consequence for the defeated kingdom.

Story rules:
- Follow the supplied title, theme, acts, scene ranges, setups, payoffs, ending sequence, and prose constraints.
- Write continuous scenes with transitions, callbacks, recurring motifs, cause and effect, and emotional consequences.
- Give major recurring characters distinct voices and include purposeful dialogue that reveals relationships, fears, loyalties, disagreements, and decisions. Let conversations continue and pay off across later scenes.
- Establish a concrete physical setting early, maintain consistent geography, and make terrain, weather, architecture, distance, and damage influence what characters can do.
- Dramatize major confrontations moment by moment with goals, danger, physical positioning, attack and defense, reversals, sensory detail, and emotional aftermath. Do not summarize decisive showdowns in a single sentence.
- Create exactly one scene per ledger ply. Set startPly equal to endPly, cover plies chronologically from 1 to the final ply, and put exactly that ply's SAN in involvedMoves.
- Quiet scenes must advance character, dialogue, travel, tension, positioning, or preparation without inventing combat, injury, or death.
- Each fantasyNarration should usually contain 2–4 substantive sentences. Let dialogue and action continue naturally across adjacent scenes.
- chessExplanation may explain the literal move, but fantasyNarration must contain publishable fantasy prose without chess terminology or coordinates.
- deaths must exactly contain the capturedPieceId for a capture and otherwise be empty. promotions must exactly contain the promoting pieceId and otherwise be empty.
- Use piece IDs only in structured characters, deaths, and promotions fields. Preserve established names in fantasyNarration.
- Keep actNumber aligned with the supplied outline. Restart sceneNumber at 1 in each act and increment it for every playback scene.
- locations, continuityNotes, visualPrompt, and videoPrompt must preserve established geography, appearance, injuries, weather, and damage.
- Make total story length proportional to the game while giving decisive scenes more room than transitional scenes.
- Before returning the package, audit every scene against its ledger event and the preceding scenes. Verify coverage, SAN, actor identity, captures, captors, deaths, promotions, checks, termination, names, injuries, locations, dialogue continuity, and survivor state. Correct every mismatch in the returned package.
- End decisively at the actual termination. Do not add later battles or chess actions.`;
