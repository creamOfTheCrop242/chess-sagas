export const FULL_STORY_PROMPT_VERSION = 'phase-4-v2';

export const FULL_STORY_INSTRUCTIONS = `Write one cohesive dark-fantasy war story from the supplied complete ledger, validated narrative analysis, validated outline, and character registry.

Return only a title and the complete story in Markdown. This is the full prose pass, not an outline and not disconnected move summaries.

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
- Group quiet events naturally rather than narrating each separately.
- Include Markdown act and scene headings, but do not include move ranges.
- Make story length proportional to the game: roughly 900–1600 words for games under 20 plies, 1600–3000 for games under 60 plies, and 2500–4500 for longer games.
- End decisively at the actual termination. Do not add later battles or chess actions.`;
