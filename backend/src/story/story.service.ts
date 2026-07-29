import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { NarrateStoryDto } from './dto/narrate-story.dto';

const SYSTEM_PROMPT = `You are the chronicler of Chess Sagas, a fantasy war between two kingdoms after the Calamity.

WORLD CANON (never contradict):
- White pieces belong to the Light Kingdom in the North.
- Black pieces belong to the Dark Kingdom in the South.
- The Calamity collided their universes. At the last second, each king forged an enchanted seal and must keep pouring energy into it to keep their realm stable.
- That is why kings are the strongest beings, yet move poorly — their power sustains the seals.
- Always call the sides "Light Kingdom" and "Dark Kingdom". Never invent other kingdom names.
- If king names are provided, you may use them as the rulers of those kingdoms.

PIECE CHARACTERS:
- Front-line infantry: each “pawn” unit is a little battalion of grunts/soldiers (no eastern/western label). Never say the word pawn — say battalion, company, grunts, or soldiers.
- Knights: knight commanders — always Eastern or Western
- Bishops: archmages — always Eastern or Western; they cross the battlefield through teleportation magic, never by walking, riding, or running the route
- Rooks: colossal moving fortresses on magic-powered wheels — always Eastern or Western. Each has a permanent living pilot physically embedded inside a life-sustaining armored command cradle. The pilot cannot simply dismount and is the machine's mind, voice, and decision-maker; the fortress itself is not sentient.
- Queens: as durable as a fortress, wield a sword like a knight, cast magic like a bishop, and move at magically amplified superhuman speed without teleporting (no eastern/western label)
- Kings: strongest of all, bound to the enchanted seal that holds the realm together after the Calamity (no eastern/western label)

ORIENTATION:
- Each kingdom has an Eastern wing and a Western wing of the battlefield.
- Prefer Eastern/Western to tell twin heroes apart.
- Use “of Light” / “of Darkness” sparingly — only when the kingdom is otherwise unclear (e.g. both sides’ similar units named in one beat, or a brief clarifying first mention). Do not append of Light/of Darkness to every title.
- Do not invent eastern/western labels for grunt battalions, queens, or kings.

STYLE:
- LENGTH (hard limit): exactly 2-4 complete sentences. About 60–110 words. Never write a long scene or multi-paragraph set piece. Stop at a finished sentence — never trail off mid-thought.
- Tone: dark and gritty overall — mud, fear, strained seals, ruthless commanders — but STRICT about when blood is spilled.
- COMBAT RULE (absolute): Death, killing, striking, wounding, butchered ranks, shattered bodies, and any physical clash with the enemy happen ONLY when this move is a capture. If Dramatic events say "quiet advance" (or list no capture), the acting character must NOT strike, kill, or engage anyone in combat — describe only movement, positioning, tension, dread, or the seal’s cost.
- When there IS a capture:
  - HERO SHOWDOWN: if BOTH attacker and victim are named champions (knight commander, archmage, moving fortress, queen, or king) — write it as a brutal one-on-one battle showdown: clash of will, named blows, a decisive finishing strike. Still 2-4 sentences, but make it feel like a duel, not a footnote.
  - Otherwise (any grunt battalion involved): savage slaughter of ranks — crushings, butchered companies, magic that burns and tears — not a polite duel.
- Continue naturally from any previous story beats provided.
- Escalate for check, castling, and promotion without inventing a kill unless a capture is listed.
- CHECKMATE RULE (absolute): When Dramatic events say the enemy king is killed / seal shattered, narrate the enemy king's death and his enchanted seal shattering. Never say "checkmate". This is the one non-capture case where the enemy king dies.
- PROXIMITY RULE: When Nearby enemies are listed, weave them into the beat as tense presence — watching, looming, blocking the way, close enough to smell blood/fear. Still obey the COMBAT RULE: being near does NOT mean fighting unless this move is a capture.
- TARGETING RULE: When Targeted enemies are listed, the acting character is aiming at / bearing down on / threatening those foes. You MUST explicitly acknowledge every listed champion target (queen, king, archmage, knight commander, moving fortress) as under attack — do not leave a threatened queen unspoken. Targeting is NOT a kill — still obey the COMBAT RULE.
- FORK / DOUBLE THREAT: If Dramatic events or Targeted enemies show more than one champion threatened at once (especially king + queen), make that double menace clear — the attacker has them both in their sights.
- Do not mention chess rules, SAN, FEN, squares as coordinates, or that this is a game. You may describe directions (north/south/east/west) and battlefield advances.
- NEVER use the word "pawn" (or "pawns"). Each infantry unit is a little battalion of grunts/soldiers — say "battalion", "company", "grunts", or "soldiers".
- Output only the story text, no title or preamble.`;

@Injectable()
export class StoryService {
  private readonly openai: OpenAI | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async narrate(dto: NarrateStoryDto): Promise<{ ply: number; story: string }> {
    if (!this.openai) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    if (!dto?.ply || !dto.san || !dto.piece || !dto.realms) {
      throw new BadRequestException('Invalid narrate payload');
    }

    const side = dto.color === 'w' ? dto.realms.white : dto.realms.black;
    const kingName =
      dto.color === 'w' ? dto.realms.whiteKingName : dto.realms.blackKingName;

    const wing = this.wingLabel(dto.from);
    const actingCharacter = this.characterLabel(dto.piece, wing);

    const events: string[] = [];
    if (dto.isCastle) {
      events.push(
        `castling / the king and the ${this.wingLabel(dto.to)} moving fortress shift together`,
      );
    }
    if (dto.isCapture) {
      const capturedWing = this.wingLabel(dto.to);
      const victim = dto.captured
        ? this.enemyCharacterLabel(dto.captured, capturedWing)
        : 'an enemy';
      const isShowdown =
        dto.piece !== 'p' && Boolean(dto.captured) && dto.captured !== 'p';
      events.push(
        isShowdown
          ? `HERO SHOWDOWN capture: ${actingCharacter} battles and slays ${victim} — write as a brutal duel/showdown`
          : `capture / slaughter of ${victim}`,
      );
    }
    if (dto.promotion) {
      events.push(
        `a little battalion of grunts ascends, their champion becoming ${this.characterLabel(dto.promotion, this.wingLabel(dto.to))}`,
      );
    }
    if (dto.isCheck) events.push('check — the enemy seal-bearer is threatened');
    if (dto.isCheckmate) {
      events.push(
        'the enemy king is killed and his enchanted seal is shattered — never say checkmate',
      );
    }

    const championThreats = (dto.targetedEnemies ?? []).filter(
      (enemy) => enemy.piece !== 'p',
    );
    if (championThreats.length > 0) {
      const threatLabels = championThreats
        .slice(0, 4)
        .map((enemy) => {
          const wing = enemy.wing ?? this.wingLabel(enemy.square);
          return this.enemyCharacterLabel(enemy.piece, wing);
        })
        .join('; ');
      const forkNote =
        championThreats.length >= 2
          ? ' — DOUBLE THREAT / FORK: explicitly name each of these as simultaneously threatened'
          : ' — must explicitly acknowledge this threat in the story';
      events.push(`still targeting after the move: ${threatLabels}${forkNote}`);
    }

    const previous =
      dto.previousStories?.filter(Boolean).slice(-2).join('\n\n') ||
      '(none — this is early in the saga)';

    const isHeroShowdown =
      dto.isCapture &&
      dto.piece !== 'p' &&
      Boolean(dto.captured) &&
      dto.captured !== 'p';

    const combatRule = dto.isCapture
      ? isHeroShowdown
        ? 'COMBAT ALLOWED — HERO SHOWDOWN: two champions clash. Write a brutal duel/showdown (named blows, clash of steel/magic/fortress weight) ending with the victim’s death. Not a quick offscreen kill.'
        : 'COMBAT ALLOWED: this move is a capture — depict the kill/clash savagely (if grunts are involved, emphasize butchered battalions).'
      : dto.isCheckmate
        ? 'KING-KILL ALLOWED: the enemy king dies and his seal shatters. Never say checkmate. Do not invent other kills unless a capture is also listed.'
        : 'NO COMBAT: this move is NOT a capture — describe only advance/positioning/tension. Do not invent striking, killing, or wounded enemies.';

    const nearbyLine = this.formatNearbyEnemies(dto.nearbyEnemies);
    const targetedLine = this.formatTargetedEnemies(dto.targetedEnemies);

    const userPrompt = `Realms: Light Kingdom (north) vs Dark Kingdom (south)
Acting side: ${side}${kingName ? ` (ruler: ${kingName})` : ''}
Acting character: ${actingCharacter}
Move SAN (for your internal understanding only): ${dto.san}
From ${dto.from} toward ${dto.to}
Dramatic events: ${events.length ? events.join('; ') : 'quiet advance'}
Nearby enemies after this move: ${nearbyLine}
Targeted enemies (acting character is attacking/threatening these): ${targetedLine}
${combatRule}

Previous story beats:
${previous}

Write the next saga beat for this move.
Hard limit: 2-4 complete sentences only. End on a finished sentence.`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.85,
        max_tokens: 450,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const choice = completion.choices[0];
      let story = choice?.message?.content?.trim();
      if (!story) {
        throw new BadGatewayException('OpenAI returned an empty story');
      }

      if (choice.finish_reason === 'length') {
        story = this.trimToLastSentence(story);
      }

      return { ply: dto.ply, story: this.scrubChessJargon(story) };
    } catch (err) {
      if (
        err instanceof ServiceUnavailableException ||
        err instanceof BadGatewayException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'OpenAI request failed';
      throw new BadGatewayException(message);
    }
  }

  private wingLabel(square: string): 'Eastern' | 'Western' {
    const file = square.charAt(0).toLowerCase();
    // a–d = west, e–h = east
    return file < 'e' ? 'Western' : 'Eastern';
  }

  private characterLabel(piece: string, wing: 'Eastern' | 'Western'): string {
    switch (piece) {
      case 'p':
        return 'a little battalion of grunts / soldiers';
      case 'n':
        return `${wing} knight commander`;
      case 'b':
        return `${wing} teleporting archmage`;
      case 'r':
        return `${wing} magic-wheeled moving fortress with a living embedded pilot`;
      case 'q':
        return 'queen (fortress durability, knight blade, archmage magic, spell-driven superhuman speed)';
      case 'k':
        return 'king bound to the enchanted seal';
      default:
        return piece;
    }
  }

  private enemyCharacterLabel(
    piece: string,
    wing: 'Eastern' | 'Western',
  ): string {
    switch (piece) {
      case 'p':
        return 'a little enemy battalion of grunts / soldiers';
      case 'n':
        return `enemy ${wing} knight commander`;
      case 'b':
        return `enemy ${wing} archmage`;
      case 'r':
        return `enemy ${wing} moving fortress`;
      case 'q':
        return 'enemy queen';
      case 'k':
        return 'enemy king';
      default:
        return 'an enemy';
    }
  }

  private formatNearbyEnemies(
    nearby?: Array<{
      piece: string;
      square: string;
      wing?: 'Eastern' | 'Western';
      distance: number;
    }>,
  ): string {
    if (!nearby?.length) {
      return 'none';
    }
    return nearby
      .slice(0, 4)
      .map((enemy) => {
        const wing = enemy.wing ?? this.wingLabel(enemy.square);
        const label = this.enemyCharacterLabel(enemy.piece, wing);
        const closeness = enemy.distance === 1 ? 'adjacent' : 'close by';
        return `${label} (${closeness})`;
      })
      .join('; ');
  }

  private formatTargetedEnemies(
    targeted?: Array<{
      piece: string;
      square: string;
      wing?: 'Eastern' | 'Western';
    }>,
  ): string {
    if (!targeted?.length) {
      return 'none';
    }
    return (
      targeted
        .filter((enemy) => enemy.piece !== 'p')
        .slice(0, 4)
        .map((enemy) => {
          const wing = enemy.wing ?? this.wingLabel(enemy.square);
          return this.enemyCharacterLabel(enemy.piece, wing);
        })
        .join('; ') || 'none (no champion targets)'
    );
  }

  private scrubChessJargon(story: string): string {
    return story
      .replace(/\bpawns?\b/gi, (match) =>
        match.toLowerCase() === 'pawns' ? 'grunts' : 'grunt',
      )
      .replace(/\bcheckmates?\b/gi, "the king's death");
  }

  private trimToLastSentence(story: string): string {
    const trimmed = story.trim();
    const match = trimmed.match(/^[\s\S]*[.!?](?=["')\]]*\s*$|["')\]]*\s)/);
    if (match?.[0]) {
      return match[0].trim();
    }
    const lastStop = Math.max(
      trimmed.lastIndexOf('.'),
      trimmed.lastIndexOf('!'),
      trimmed.lastIndexOf('?'),
    );
    if (lastStop > 40) {
      return trimmed.slice(0, lastStop + 1).trim();
    }
    return trimmed;
  }
}
