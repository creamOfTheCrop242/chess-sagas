export const STORY_VALIDATION_PROMPT_VERSION = 'phase-5-v16';

export const STORY_VALIDATION_INSTRUCTIONS = `Validate the supplied story against the complete deterministic chess ledger, narrative analysis, outline, and deterministic findings.

Return structured findings only plus an optional repaired full Markdown story.

Report:
- every missing or invented capture and every wrong captor
- any captured character returning or survivor being killed
- incorrect or missing promotions, checks, checkmate, winner, or ending
- a promotion occurring without the invading soldier commandeering the enemy kingdom's ancient prototype Ascension Seal at the analysis-defined ascensionSite; giving the soldier a personal Seal; linking the prototype to the wrong King; or failing to damage the enemy King and his Royal Seal bond at that exact promotion ply
- failure to preserve cumulative enemy-King ascension strain after one or more promotions, confusion between ascension strain and check strain or woundPlans, or assigning promotion damage to the promoting soldier's own King
- revealing a promoted form before its promotion ply; transforming the whole company or a replacement character; losing the soldier's name, memories, wounds, relationships, former role, or loyalties; or producing a form other than the ledger-recorded promotion
- incorrect form-specific Ascension: a Queen without completed augmentation, high sorcery, and fortress-grade armor; a Knight Commander without limited augmentation, command authority, and a magic-powered heavy weapon; an Archwizard without awakened broad high sorcery and teleportation; or a Moving Fortress that invents a preexisting wound instead of constructing an engine around and permanently integrating the soldier
- treating Queen Candidate status as a guarantee or advance revelation of Queen promotion, replacing a still-living reigning Queen, or failing to give emotional weight when a candidate Ascends into a different recorded form
- inconsistent permanent names
- any claim that the Calamity directly created the multiple realities; they were fractured afterward by the incompatible magic each King siphoned from a different universe
- any claimed continuity, prior event, relationship, wound, death, promotion, or outcome imported from another battle record; every record is a separate fractured reality
- failure to treat the supplied battle as that reality's final battle, or assigning a known date, age, or elapsed time to the Calamity
- board coordinates or chess terminology in reader-facing prose
- any public title that reveals the ending, result, winner, defeated King, destroyed Seal, checkmate, resignation, surrender, draw, victory, or defeat; or that contains a board square, coordinate, rank, file, move number, SAN, or chess notation
- important Queen combat lacking either swordplay or magic
- Queen movement contradicting the event's authoritative queenTravelMode: a one- or two-square walk portrayed as a magical rush, a three-or-more-square magical rush portrayed as ordinary walking, or either mode portrayed as teleportation; danger and tone are not exceptions
- a Queen portrayed without lifelong training by the King, Archwizards, Knight Commanders, and pawn-company soldiers; without magical bodily augmentation; or without extremely heavy nearly indestructible Moving-Fortress armor when those details are relevant
- a Queen whose actions repeatedly contradict or replace the exact combat discipline established in her character-registry backstory; treat the discipline as a persistent preferred style rather than a prohibition on adapting or using her broader abilities
- a Knight Commander portrayed as an ordinary soldier rather than an elite augmented captain; as equal or close to the Queen's enhancement; using a signature weapon that contradicts the character registry; teleporting; wearing Fortress-grade armor; or wielding broad Archwizard-level sorcery
- Archwizard movement contradicting the event's authoritative archwizardTravelMode: a one- or two-square walk portrayed as teleportation, or a three-or-more-square teleport portrayed as walking, running, or riding; danger and tone are not exceptions
- an Archwizard portrayed as possessing only teleportation magic, or repetitive combat that incorrectly turns every Archwizard spell into a portal, blink, or spatial effect
- an Archwizard's registry-defined training history being contradicted or replaced with generic royal-college education; do not require college attendance when the established path is private apprenticeship, inherited tradition, natural gift, battlefield learning, forbidden research, or self-teaching
- a Moving Fortress portrayed without magic-powered wheels, with a pilot who is not alive and physically embedded within it, or as a sentient machine acting independently of its pilot
- a Moving Fortress using a primary weapon or specialized attachment that contradicts its registry backstory; lacking its ability to ram; or being portrayed as relying almost exclusively on ramming while its established magic-round cannon, gatling gun, batteries, rifles, bombard, or storm-caster is repeatedly ignored when ranged fire is tactically appropriate
- a Royal Seal portrayed as creating magic independently or as the realm's original source of magic, rather than distributing energy its King siphons from the kingdom's lost home universe
- a King portrayed as physically aging while his inter-universal current remains intact, or agelessness incorrectly treated as invulnerability to check damage, exhaustion, wounds, or checkmate death
- a King's registry-defined ruling disposition contradicted without a story-earned reason, especially a merciful ruler ordering arbitrary execution or an uncompromising ruler accepting surrender without accounting for the change; deterministic surrenderContext and defeatedKingFate remain authoritative
- any nonfatal injury or dismemberment absent from outline woundBeats, inflicted outside its recorded capture, applied to the wrong survivor, prematurely healed, forgotten in later action, or contradicted by intact anatomy; cumulative royal strain inflicted on the threatened King at each ledger-confirmed check is the sole exception and must remain separate from woundBeats
- any ledger-confirmed check that fails to inflict a new increment of royal strain on the threatened King, any check strain assigned to the wrong King or wrong ply, or later prose that forgets the accumulated effect of earlier checks
- replacement of an earlier wound by a later one instead of cumulative limitations; minor-wound recovery without explicit treatment, magical intervention, or meaningful time; loss of residual scars after recovery; or any recovery from a grave, critical, crippling, organ, spinal, skull, or maiming injury during the final battle
- any fatal dismemberment outside a ledger-confirmed death, or repetitive dismemberment that weakens rather than sharpens major violence
- after a Seal's destruction, omission of the gradual entombment threat facing any surviving defeated-realm Moving Fortress pilot; instantaneous Fortress failure; entombment in the victorious realm; or an invented pilot death
- a missing or generic defeated-King cause of death; the ending must state the specific physical or magical cause established by the final scene
- an ending without two distinct movements: immediate aftermath followed by a varied later time jump rooted in this saga's particular characters, imagery, battlefield, and magical consequences; flag repetitive generic rebuilding or an unrelated sequel hook
- outline setup/payoff or continuity violations

Treat supplied deterministicFindings as authoritative errors that must be repaired. Do not duplicate them in the returned findings array. Use exact piece IDs and plies in new findings, but never add them to prose.

If either deterministicFindings or your new findings contain an error, repairedStoryMarkdown MUST contain the complete repaired story. This requirement applies even when your returned findings array is empty because the only errors were supplied deterministic findings. Preserve unaffected passages and patch only affected sections. The repair must resolve every deterministic and semantic error without inventing events. Only return null when both supplied deterministicFindings and your new findings contain no errors.`;

export const PROHIBITED_PROSE_TERMS = `The repaired reader-facing story must not contain any of these literal terms, including in its title, headings, dialogue, or final line: chess, checkmate, SAN, FEN, ply, plies, A-file through H-file, or file company. Use fantasy-native language such as final defeat, battle record, battlefront, or soldier company instead.`;
