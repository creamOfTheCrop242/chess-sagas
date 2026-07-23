import { Component, HostListener, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { ChessboardComponent } from './chessboard.component';
import { PgnApiService } from './pgn-api.service';
import { NarrateRequest, ParsedPgn, ParsedPosition } from './pgn.models';

@Component({
  selector: 'app-pgn-viewer',
  standalone: true,
  imports: [FormsModule, ChessboardComponent],
  templateUrl: './pgn-viewer.component.html',
  styleUrl: './pgn-viewer.component.css',
})
export class PgnViewerComponent implements OnDestroy {
  pgnText = '';
  loading = false;
  error: string | null = null;
  game: ParsedPgn | null = null;
  currentPly = 0;

  stories: Record<number, string> = {};
  storyLoading = false;
  storyError: string | null = null;

  private narrateSub: Subscription | null = null;
  private prefetchSub: Subscription | null = null;
  private activeNarratePly: number | null = null;

  constructor(private readonly pgnApi: PgnApiService) {}

  get currentFen(): string {
    if (!this.game) {
      return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    }
    if (this.currentPly === 0) {
      return this.game.startFen;
    }
    return this.game.positions[this.currentPly - 1].fen;
  }

  get currentMove(): ParsedPosition | null {
    if (!this.game || this.currentPly === 0) {
      return null;
    }
    return this.game.positions[this.currentPly - 1];
  }

  get currentMoveLabel(): string {
    const move = this.currentMove;
    if (!move) {
      return 'Start position';
    }
    const moveNumber = Math.ceil(move.ply / 2);
    const isWhite = move.ply % 2 === 1;
    return isWhite ? `${moveNumber}. ${move.san}` : `${moveNumber}... ${move.san}`;
  }

  get gameTitle(): string {
    if (!this.game) {
      return '';
    }
    const white = this.game.realms.white;
    const black = this.game.realms.black;
    const result = this.game.headers['Result'];
    return result ? `${white} vs ${black} (${result})` : `${white} vs ${black}`;
  }

  get canGoBack(): boolean {
    return !!this.game && this.currentPly > 0;
  }

  get canGoForward(): boolean {
    return !!this.game && this.currentPly < this.game.positions.length;
  }

  get currentStory(): string | null {
    if (!this.game) {
      return null;
    }
    if (this.currentPly === 0) {
      return this.introStory();
    }
    return this.stories[this.currentPly] ?? null;
  }

  submit(): void {
    this.error = null;
    this.loading = true;
    this.cancelNarration();
    this.pgnApi.parse(this.pgnText).subscribe({
      next: (game) => {
        this.game = game;
        this.stories = {};
        this.storyError = null;
        this.storyLoading = false;
        this.currentPly = 0;
        this.loading = false;
      },
      error: (err: unknown) => {
        this.game = null;
        this.stories = {};
        this.currentPly = 0;
        this.loading = false;
        this.storyLoading = false;
        this.storyError = null;
        this.error = this.extractError(err, 'Failed to parse PGN');
      },
    });
  }

  back(): void {
    if (!this.canGoBack) {
      return;
    }
    this.setPly(this.currentPly - 1);
  }

  forward(): void {
    if (!this.canGoForward) {
      return;
    }
    this.setPly(this.currentPly + 1);
  }

  ngOnDestroy(): void {
    this.cancelNarration();
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.game) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.back();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.forward();
    }
  }

  private setPly(ply: number): void {
    this.currentPly = ply;
    this.ensureStoryForPly(ply, false);
  }

  private ensureStoryForPly(ply: number, silent: boolean): void {
    if (!this.game || ply <= 0) {
      if (!silent) {
        this.storyLoading = false;
        this.storyError = null;
      }
      return;
    }

    if (this.stories[ply]) {
      if (!silent) {
        this.storyLoading = false;
        this.storyError = null;
        this.prefetchNext(ply);
      }
      return;
    }

    const move = this.game.positions[ply - 1];
    if (!move) {
      return;
    }

    if (!silent) {
      this.cancelVisibleNarration();
      this.storyLoading = true;
      this.storyError = null;
      this.activeNarratePly = ply;
      this.narrateSub = this.pgnApi.narrate(this.buildNarratePayload(move)).subscribe({
        next: (res) => {
          if (this.activeNarratePly !== ply) {
            return;
          }
          this.stories[res.ply] = res.story;
          this.storyLoading = false;
          this.storyError = null;
          this.activeNarratePly = null;
          this.prefetchNext(ply);
        },
        error: (err: unknown) => {
          if (this.activeNarratePly !== ply) {
            return;
          }
          this.storyLoading = false;
          this.activeNarratePly = null;
          this.storyError = this.extractError(err, 'Failed to generate story');
        },
      });
      return;
    }

    this.prefetchSub?.unsubscribe();
    this.prefetchSub = this.pgnApi.narrate(this.buildNarratePayload(move)).subscribe({
      next: (res) => {
        this.stories[res.ply] = res.story;
      },
      error: () => {
        // Prefetch failures are silent
      },
    });
  }

  private prefetchNext(fromPly: number): void {
    if (!this.game) {
      return;
    }
    const next = fromPly + 1;
    if (next > this.game.positions.length || this.stories[next]) {
      return;
    }
    this.ensureStoryForPly(next, true);
  }

  private buildNarratePayload(move: ParsedPosition): NarrateRequest {
    return {
      ply: move.ply,
      san: move.san,
      color: move.color,
      piece: move.piece,
      from: move.from,
      to: move.to,
      captured: move.captured,
      promotion: move.promotion,
      isCapture: move.isCapture,
      isCheck: move.isCheck,
      isCheckmate: move.isCheckmate,
      isCastle: move.isCastle,
      nearbyEnemies: move.nearbyEnemies,
      targetedEnemies: move.targetedEnemies,
      realms: this.game!.realms,
      previousStories: this.previousBeats(move.ply),
    };
  }

  private previousBeats(ply: number): string[] {
    const beats: string[] = [];
    for (let p = ply - 2; p < ply; p++) {
      if (p > 0 && this.stories[p]) {
        beats.push(this.stories[p]);
      }
    }
    return beats;
  }

  private introStory(): string {
    const whiteKing = this.game?.realms.whiteKingName;
    const blackKing = this.game?.realms.blackKingName;
    const lightRuler = whiteKing ? `, ruled by ${whiteKing},` : '';
    const darkRuler = blackKing ? `, ruled by ${blackKing},` : '';
    return (
      `After the Calamity, the universes of the Light Kingdom in the north${lightRuler} ` +
      `and the Dark Kingdom in the south${darkRuler} smashed together — skies tore, cities died, ` +
      `and whole hosts were ground to ash between colliding worlds. ` +
      `At the last second each king carved an enchanted seal and now bleeds power into it without rest, ` +
      `holding their realm together while the war begins. Step forward into the slaughter.`
    );
  }

  private cancelNarration(): void {
    this.cancelVisibleNarration();
    this.prefetchSub?.unsubscribe();
    this.prefetchSub = null;
  }

  private cancelVisibleNarration(): void {
    this.narrateSub?.unsubscribe();
    this.narrateSub = null;
    this.activeNarratePly = null;
  }

  private extractError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const message = err.error?.message;
      if (Array.isArray(message)) {
        return message.join(', ');
      }
      if (typeof message === 'string') {
        return message;
      }
      return err.message || fallback;
    }
    return fallback;
  }
}
