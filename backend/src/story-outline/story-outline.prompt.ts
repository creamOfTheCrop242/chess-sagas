export const STORY_OUTLINE_PROMPT_VERSION = 'phase-3-v16';

export const STORY_OUTLINE_INSTRUCTIONS = `Create a structured outline for one cohesive dark-fantasy story. Return planning JSON only; do not write story prose.

The complete ledger is factual source of truth. The narrative analysis supplies the global plan, and the character registry supplies permanent identities.

- If validationFeedback is present, this is a targeted retry. Correct every cited structural problem while preserving valid character arcs, setups, and payoffs.
- Cover every ply exactly once with chronological, contiguous acts and scenes.
- Follow the narrative analysis act boundaries.
- Group related quiet moves into shared scenes.
- Give every capture, check, checkmate, promotion, and castling event explicit weight by listing its ply in requiredEventPlies.
- Never invent events, deaths, survivors, characters, or ply numbers.
- Establish important characters and promoting soldiers before their payoff.
- Treat every Moving Fortress as a colossal wheeled war engine powered by magic. Its permanent living pilot in operatorName is physically embedded within a life-sustaining armored command cradle and cannot simply dismount. Track that pilot's viewpoint, orders, fear, injuries, and relationships whenever the Fortress acts; never give the structure independent thoughts, dialogue, or decisions.
- When a Moving Fortress captures, its operator directs the killing action through the machine. When one is captured, plan the machine's destruction and the operator's death or final fate as the same ledger-confirmed loss.
- For every pawn scene, the pawn's company moves and fights as the military unit while the named viewpoint grunt in its registry entry anchors the reader's perspective.
- Preserve each viewpoint grunt's viewpointRole and chain of command. Captains may command their companies; ordinary soldiers and specialists must experience company orders from their actual station and cannot casually command officers or the whole formation.
- Use role differences for character depth: a scout sees danger first, a medic faces divided duties, a standard-bearer carries morale, a spearman holds the line, and a junior officer mediates between commanders and troops.
- Track that grunt's dialogue, relationships, injuries, fears, and choices across the company's scenes. If the pawn promotes, make the same grunt's personal transformation the payoff; never introduce a replacement character.
- Preserve every relationshipPlan from the analysis in relationshipBeats. Schedule multiple concrete beats where possible, place both exact characters in each corresponding scene, show a distinct progression rather than repeated reminders, and give the relationship an emotional payoff before either participant's death or the ending.
- Relationship beats must change later dialogue, choices, grief, trust, rivalry, sacrifice, or command behavior. Tactical proximity alone is not relationship development.
- If a pawn captures an enemy, explicitly plan for its named viewpoint grunt to deliver the final blow to that captured character. Supporting company action may create the opening, but the capture belongs personally to the viewpoint grunt.
- For pawn-on-pawn captures, the attacking viewpoint grunt defeats the captured company's viewpoint grunt as the surrounding company falls, routs, or surrenders.
- Every setup must precede its payoff.
- Make major deaths affect subsequent emotional beats.
- Give every capture a fully dramatized killing beat: approach, resistance, decisive impact, visceral bodily consequence, the confirmed victim's final reaction, and immediate witness or battlefield aftermath.
- Specify how the victim experiences the fatal moment: what they notice, understand, feel, attempt, and emotionally express. Include a character-specific final word, thought, gesture, memory, or look when the manner of death permits it.
- Never reduce a named victim to a passive body or describe only the killer's experience. For instantaneous deaths, show the victim's final fraction of recognition or reflex without making them think or speak after death.
- Keep gore ledger-accurate. Only the captured character is confirmed killed; do not add unnamed deaths, kill survivors, or describe bloodshed during quiet moves.
- Make the ending sequence arise from the actual result and termination.
- For checkmate, outline the defeated King's on-page death as the final consequence of the mating attack or Royal Seal's destruction, even though the King is not recorded as a captured piece.
- For checkmate, the defeated Royal Seal must also be destroyed.
- For checkmate, make the final scenes explicitly stage every relevant constraint in the ledger's checkmateExplanation: the checking attacker, protected attacker, sealed escape routes, friendly obstructions, controlled routes, and inability to capture, block, or receive aid. The King must understand why no legal physical or magical escape remains before the fatal culmination.
- For resignation or surrender, outline the defeated King consciously yielding and then dying by suicide in a character-specific tragic scene. His death destroys or extinguishes the Seal he sustained. Include witness and kingdom reactions without romanticizing the act or providing instructional detail.
- For resignation, require the epilogue to explicitly name the surrender, the defeated King's suicide, the Royal Seal's destruction, and the defeated kingdom's resulting magical, civic, and political decline.
- Treat each Royal Seal as the source powering its kingdom's magic. Plan the defeated realm's gradual decline as stored magic runs out: wards fail, enchanted infrastructure decays, harvests and healing suffer, political order fractures, and survivors must adapt.
- Draws, timeouts, and unknown terminations must not automatically kill either King.
- Queens must use both swordplay and magic in later prose.
- Treat every Queen move as magically amplified superhuman motion: sudden acceleration, impossible speed, or a spell-driven dash that remains physically distinct from teleportation.
- Treat every Archwizard move as teleportation across the battlefield. Plan an arrival through folded space, a portal, a blink, or equivalent magic; never make an Archwizard slowly walk, ride, or run the route.
- Use piece IDs for all character references.
- Coordinates may appear in this inspectable outline but must be prohibited in final prose.`;
