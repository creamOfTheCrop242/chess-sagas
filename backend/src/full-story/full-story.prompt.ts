export const FULL_STORY_PROMPT_VERSION = 'story-package-v15';

export const FULL_STORY_INSTRUCTIONS = `Write one cohesive dark-fantasy war story package from the supplied complete ledger, validated narrative analysis, validated outline, and character registry.

Return compact structured JSON containing the title, defeatedKingFate, defeatedSealFate, epilogue, and exactly one creative scene for every ledger ply. Each scene contains only ply, fantasyNarration, characters, and locations. The backend derives all mechanical playback metadata, including the decisive actor, directly from the ledger. The ordered fantasyNarration fields are consecutive paragraphs of the complete story. They must read as one continuous saga when joined, not as disconnected move summaries.

Factual rules:
- The ledger is the source of truth. Never invent or omit captures, change a captor, kill a survivor, revive a captured piece, alter a promotion, change the winner, or change termination.
- White is the north/Light Kingdom. Black is the south/Dark Kingdom. Neither is inherently good or evil.
- Use permanent character names from the registry, never piece IDs in reader-facing prose.
- Do not mention chess, moves, plies, SAN, FEN, ranks, files, board coordinates, or algebraic notation in prose.
- A quiet move may create tension, positioning, travel, or preparation, but not combat, injury, or death.
- Check threatens the King and Royal Seal.
- Kings sustain enchanted Royal Seals and are immensely powerful but constrained by that burden.
- Each Royal Seal is the magical heart and power source of its entire kingdom. It feeds wards, enchanted fortresses and weapons, healing, transportation, agriculture, civic protections, and other magical infrastructure.
- After a Seal is destroyed, existing stored magic fades rather than disappearing all at once. Wards weaken, enchantments fail, infrastructure decays, harvests and healing suffer, institutions fracture, and the kingdom gradually crumbles unless its survivors adapt without magic.
- Queens combine master swordsmanship, Archwizard-level magic, and Moving-Fortress durability. Important Queen action must demonstrate both blade and magic.
- Bishops are Archwizards, rooks are Moving Fortresses, knights are Knight Commanders, and pawns are soldier companies. Never call them chess pieces.
- A Moving Fortress is a colossal non-sentient war machine controlled and operated by the permanent soldier named in operatorName. Narrate the operator as its human viewpoint, decision-maker, and voice; the structure must never think, speak, choose, or act independently.
- When a Moving Fortress captures, its operator personally directs and executes the attack through the machine. When a Moving Fortress is captured, destroy the machine and include its operator's death or final fate in that same ledger-confirmed loss.
- A pawn's move means its entire company advances, retreats, attacks, or repositions, but narrate that company-scale action through the specific grunt identified by viewpointName in the character registry.
- Honor the registry's viewpointRole. Some followed grunts are company captains, but others are ordinary spearmen, scouts, medics, shield-bearers, standard-bearers, sergeants, or other ranks.
- Never promote a viewpoint grunt socially just because the story follows them. Only a company captain may routinely issue company-level commands. Non-captains receive orders through the chain of command and act, speak, influence others, resist, or show heroism from their actual role.
- Let rank affect voice, knowledge, equipment, responsibility, access to leaders, and emotional stakes. An ordinary grunt may not know the generals' plans, and a captain should carry responsibility for the entire company.
- Keep the narrative close to that named grunt's senses, dialogue, private fears, relationships, and decisions. Other soldiers may appear, but never replace or rename the viewpoint grunt.
- Whenever a pawn captures another piece, the pawn's named viewpoint grunt must personally deliver the decisive final blow to the captured character. The company may create the opening or support the clash, but never attribute the kill to an unnamed soldier, a collective attack, an accident, or someone else.
- When a pawn captures another pawn, show the attacking viewpoint grunt personally defeating the captured company's named viewpoint grunt. Then portray the wider captured company's defeat, rout, destruction, or surrender without inventing additional ledger deaths.
- If a pawn is captured, portray the company defeat and the established viewpoint grunt's ledger-consistent fate. Never silently transfer the viewpoint identity to another survivor.
- If a pawn promotes, the viewpoint grunt personally undergoes the ascension and becomes the promoted Queen or other champion. The company does not collectively become one person. Preserve the grunt's exact name, memories, wounds, personality, relationships, loyalties, and emotional arc after transformation.
- For checkmate, set defeatedKingFate to killed-after-checkmate and show the defeated King's on-page death as the direct culmination of the mating assault, a fatal blow, or catastrophic Royal Seal destruction. This required terminal death is allowed even though the King was not captured.
- For checkmate, set defeatedSealFate to destroyed and depict the defeated Seal's destruction as part of the climax.
- For resignation or surrender, set defeatedKingFate to suicide-after-surrender and defeatedSealFate to destroyed. Show the defeated King knowingly surrendering and then dying by suicide as a tragic, character-specific final act; his death destroys or extinguishes the Seal he sustained. Show emotional and political consequences without romanticizing the death or turning it into procedural instruction.
- Treat a ledger termination of resignation as authoritative even when inferred from a decisive result in a still-playable final position. The epilogue must explicitly state that the defeated King surrendered, recount his suicide without procedural detail, show the Royal Seal being destroyed or extinguished, and describe the defeated kingdom's ensuing magical, civic, and political decline.
- For draws, timeouts, and unknown terminations, set defeatedKingFate to survives and defeatedSealFate to intact. Do not automatically kill either King or destroy either Seal.
- Never apply the defeated fate to the winning King.

Story rules:
- Follow the supplied title, theme, acts, scene ranges, setups, payoffs, ending sequence, and prose constraints.
- Write continuous scenes with transitions, callbacks, recurring motifs, cause and effect, and emotional consequences.
- Give major recurring characters distinct voices and include purposeful dialogue that reveals relationships, fears, loyalties, disagreements, and decisions. Let conversations continue and pay off across later scenes.
- Establish a concrete physical setting early, maintain consistent geography, and make terrain, weather, architecture, distance, and damage influence what characters can do.
- Dramatize major confrontations moment by moment with goals, danger, physical positioning, attack and defense, reversals, sensory detail, and emotional aftermath. Do not summarize decisive showdowns in a single sentence.
- Treat every capture as an on-page, visceral dark-fantasy killing rather than saying the victim merely fell, vanished, or was defeated. Slow the beat down to show the approach, resistance, weapon or spell making contact, bodily damage, the victim's final reaction, and the immediate aftermath.
- Show the victim experiencing the fatal moment from inside their own awareness as well as through the killer's perspective. Include what the victim notices, realizes, physically feels, tries to do, and emotionally expresses as death becomes unavoidable.
- Give named victims a character-specific final word, broken sentence, thought, memory, gesture, expression, or look whenever the timing of the wound allows it. Their response must reflect established personality, loyalties, fears, wounds, and relationship with the killer.
- Never treat a named victim as a passive prop for the captor. For an instantaneous death, use a brief final recognition, reflex, or interrupted intention; do not grant speech, thought, or action after consciousness and life have ended.
- Use concrete but purposeful gore appropriate to the combatants: blood on armor and terrain, broken bone, torn flesh, dismemberment, crushing force, burning, or magical bodily destruction. Vary the imagery and killing method; do not repeat the same generic wound.
- The captor's established weapon, magic, scale, personality, injuries, and relationship to the victim must shape the kill. Witnesses should react, and important deaths should alter later dialogue and behavior.
- Gore must remain ledger-accurate. Only the captured character is confirmed killed. Never add collateral deaths, kill a survivor, dismember a character who acts later unless continuity supports a survivable lasting injury, or turn checks and quiet moves into bloodshed.
- Never describe, remember, mourn, or foreshadow any character as dead, slain, lifeless, deceased, a corpse, or buried before that character's ledger capture occurs. A character captured later is alive in every earlier scene.
- When a pawn company is captured, focus the fatal detail on its named viewpoint grunt and portray the wider company's defeat, rout, or surrender without claiming unrecorded mass deaths.
- Create exactly one scene per ledger ply. Set ply to that ledger ply and cover every ply chronologically from 1 to the final ply.
- Quiet scenes must advance character, dialogue, travel, tension, positioning, or preparation without inventing combat, injury, or death.
- Each fantasyNarration should usually contain 2–4 substantive sentences. Let dialogue and action continue naturally across adjacent scenes.
- Capture scenes may expand to 4–7 sentences when needed to portray the full killing and aftermath without rushing.
- fantasyNarration must contain publishable fantasy prose without chess terminology or coordinates.
- Use piece IDs only in the structured characters field. Preserve established names in fantasyNarration.
- For every capture, the prose must give the ledger event's exact pieceId character credit for the decisive action.
- locations must use stable fantasy place names and preserve established geography.
- Make total story length proportional to the game while giving decisive scenes more room than transitional scenes.
- Before returning the package, audit every scene against its ledger event and the preceding scenes. Verify ply coverage, actor identity, captures, captors, deaths, promotions, checks, termination, names, injuries, locations, dialogue continuity, and survivor state. Correct every mismatch in the returned package.
- End decisively at the actual termination. Do not add later battles or chess actions.`;

export const EPILOGUE_INSTRUCTIONS = `Epilogue rules:
- Write a distinct epilogue of roughly 250–600 words that occurs after the final move and its immediate outcome.
- Resolve the defeated King's required fate, the surviving King's burden, the condition of both kingdoms, important survivors, named viewpoint grunts, promotions, grief, rivalries, and the political or emotional cost of the battle.
- If a Royal Seal was destroyed, show the defeated kingdom beginning to exhaust its remaining stored magic. Include concrete early failures and foreshadow its longer decline without inventing another battle or immediate total collapse.
- If both Seals remain intact, preserve both kingdoms' access to magic while showing the strain, damage, and cost caused by the war.
- Pay off recurring imagery, dialogue, promises, fears, relationships, wounds, and sacrifices established earlier.
- For a draw, show the concrete terms or consequences of the unresolved ending without declaring a winner or killing either King automatically.
- Do not invent another move, attack, capture, promotion, battle, or death after the ledger ends. Survivors must remain alive, though they may grieve, depart, reconcile, face judgment, or inherit new responsibilities.
- The epilogue must feel conclusive rather than teasing an immediate continuation.`;
