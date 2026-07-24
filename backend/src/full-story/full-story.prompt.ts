export const FULL_STORY_PROMPT_VERSION = 'story-package-v4';

export const FULL_STORY_INSTRUCTIONS = `Write one cohesive dark-fantasy war story package from the supplied complete ledger, validated narrative analysis, validated outline, and character registry.

Return compact structured JSON containing the title and exactly one creative scene for every ledger ply. Each scene contains only ply, fantasyNarration, characters, locations, and decisiveActorId. The backend derives all other mechanical playback metadata. The ordered fantasyNarration fields are consecutive paragraphs of the complete story. They must read as one continuous saga when joined, not as disconnected move summaries.

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
- A pawn's move means its entire company advances, retreats, attacks, or repositions, but narrate that company-scale action through the specific grunt identified by viewpointName in the character registry.
- Keep the narrative close to that named grunt's senses, dialogue, private fears, relationships, and decisions. Other soldiers may appear, but never replace or rename the viewpoint grunt.
- Whenever a pawn captures another piece, the pawn's named viewpoint grunt must personally deliver the decisive final blow to the captured character. The company may create the opening or support the clash, but never attribute the kill to an unnamed soldier, a collective attack, an accident, or someone else.
- When a pawn captures another pawn, show the attacking viewpoint grunt personally defeating the captured company's named viewpoint grunt. Then portray the wider captured company's defeat, rout, destruction, or surrender without inventing additional ledger deaths.
- If a pawn is captured, portray the company defeat and the established viewpoint grunt's ledger-consistent fate. Never silently transfer the viewpoint identity to another survivor.
- If a pawn promotes, the viewpoint grunt personally undergoes the ascension and becomes the promoted Queen or other champion. The company does not collectively become one person. Preserve the grunt's exact name, memories, wounds, personality, relationships, loyalties, and emotional arc after transformation.
- Checkmate or resignation must cause a severe, story-specific consequence for the defeated kingdom.

Story rules:
- Follow the supplied title, theme, acts, scene ranges, setups, payoffs, ending sequence, and prose constraints.
- Write continuous scenes with transitions, callbacks, recurring motifs, cause and effect, and emotional consequences.
- Give major recurring characters distinct voices and include purposeful dialogue that reveals relationships, fears, loyalties, disagreements, and decisions. Let conversations continue and pay off across later scenes.
- Establish a concrete physical setting early, maintain consistent geography, and make terrain, weather, architecture, distance, and damage influence what characters can do.
- Dramatize major confrontations moment by moment with goals, danger, physical positioning, attack and defense, reversals, sensory detail, and emotional aftermath. Do not summarize decisive showdowns in a single sentence.
- Create exactly one scene per ledger ply. Set ply to that ledger ply and cover every ply chronologically from 1 to the final ply.
- Quiet scenes must advance character, dialogue, travel, tension, positioning, or preparation without inventing combat, injury, or death.
- Each fantasyNarration should usually contain 2–4 substantive sentences. Let dialogue and action continue naturally across adjacent scenes.
- fantasyNarration must contain publishable fantasy prose without chess terminology or coordinates.
- Use piece IDs only in the structured characters field. Preserve established names in fantasyNarration.
- Set decisiveActorId to the capturing pieceId for a capture and null for every non-capture. The prose must give that exact character credit for the decisive action.
- locations must use stable fantasy place names and preserve established geography.
- Make total story length proportional to the game while giving decisive scenes more room than transitional scenes.
- Before returning the package, audit every scene against its ledger event and the preceding scenes. Verify ply coverage, actor identity, captures, captors, deaths, promotions, checks, termination, names, injuries, locations, dialogue continuity, and survivor state. Correct every mismatch in the returned package.
- End decisively at the actual termination. Do not add later battles or chess actions.`;
