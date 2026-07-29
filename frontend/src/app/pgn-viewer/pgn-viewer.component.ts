import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ChessboardComponent } from './chessboard.component';
import { PgnApiService } from './pgn-api.service';
import {
  ParsedPgn,
  ParsedPosition,
  PieceIdentity,
  PlaybackScene,
  ChessEvent,
  SagaStage,
  SagaStageState,
} from './pgn.models';

type FallenPiece = {
  victim: PieceIdentity;
  killer: PieceIdentity;
  ply: number;
};

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
  gameId: string | null = null;
  currentPly = 0;
  boardOrientation: 'white' | 'black' = 'black';
  hoveredPieceId: string | null = null;
  selectedPieceId: string | null = null;
  fallenRosterOpen = false;
  scenes: PlaybackScene[] = [];
  epilogue = '';
  sagaGenerating = false;
  storyError: string | null = null;
  generationElapsedSeconds = 0;
  private generationStartedAt: number | null = null;
  private generationTimer: ReturnType<typeof setInterval> | null = null;
  readonly pipelineSteps: Array<{ id: SagaStage; label: string }> = [
    { id: 'analysis', label: 'Narrative analysis' },
    { id: 'outline', label: 'Story outline' },
    { id: 'story', label: 'Full story' },
    { id: 'validation', label: 'Validation and repair' },
    { id: 'scenes', label: 'Scene alignment' },
  ];
  pipelineState: Record<SagaStage, SagaStageState> =
    this.initialPipelineState();

  constructor(private readonly pgnApi: PgnApiService) {}

  get currentFen(): string {
    if (!this.game)
      return 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (this.currentPly > this.game.positions.length) {
      return this.game.ledger.finalFen;
    }
    return this.currentPly === 0
      ? this.game.startFen
      : this.game.positions[this.currentPly - 1].fen;
  }
  get currentMove(): ParsedPosition | null {
    return !this.game ||
      this.currentPly === 0 ||
      this.currentPly > this.game.positions.length
      ? null
      : this.game.positions[this.currentPly - 1];
  }
  get currentMoveLabel(): string {
    if (this.isEpiloguePage) return 'Epilogue';
    const move = this.currentMove;
    if (!move) return 'Start position';
    const number = Math.ceil(move.ply / 2);
    return move.ply % 2 ? `${number}. ${move.san}` : `${number}... ${move.san}`;
  }
  get gameTitle(): string {
    if (!this.game) return '';
    const title = `${this.game.realms.white} vs ${this.game.realms.black}`;
    return this.game.headers['Result']
      ? `${title} (${this.game.headers['Result']})`
      : title;
  }
  get canGoBack(): boolean {
    return !!this.game && this.currentPly > 0;
  }
  get canGoForward(): boolean {
    return !!this.game && this.currentPly < this.finalPlaybackPly;
  }
  get isEpiloguePage(): boolean {
    return (
      !!this.game &&
      Boolean(this.epilogue) &&
      this.currentPly === this.game.positions.length + 1
    );
  }
  get currentScene(): PlaybackScene | null {
    if (
      this.currentPly <= 0 ||
      !this.game ||
      this.currentPly > this.game.positions.length
    )
      return null;
    return (
      this.scenes.find(
        (scene) =>
          this.currentPly >= scene.startPly && this.currentPly <= scene.endPly,
      ) ?? null
    );
  }
  get currentStory(): string {
    if (this.currentPly === 0) return this.introStory();
    if (this.isEpiloguePage) return this.epilogue;
    return this.currentScene?.fantasyNarration ?? '';
  }
  get epilogueParagraphs(): string[] {
    if (!this.epilogue.trim()) return [];
    return this.epilogue
      .split(/\n\s*\n/)
      .flatMap((paragraph) => {
        const sentences =
          paragraph
            .trim()
            .match(/[^.!?]+(?:[.!?]+(?:["'’”]+)?|$)/g)
            ?.map((sentence) => sentence.trim())
            .filter(Boolean) ?? [];
        const grouped: string[] = [];
        for (let index = 0; index < sentences.length; index += 2) {
          grouped.push(sentences.slice(index, index + 2).join(' '));
        }
        return grouped;
      })
      .filter(Boolean);
  }
  get inspectedPiece(): PieceIdentity | null {
    if (!this.game) return null;
    const pieceId = this.hoveredPieceId ?? this.selectedPieceId;
    return (
      this.game.ledger.pieces.find((piece) => piece.id === pieceId) ?? null
    );
  }
  get inspectedPieceKills(): number {
    const piece = this.inspectedPiece;
    if (!this.game || !piece) return 0;
    return this.game.ledger.events.filter(
      (event) =>
        event.ply <= this.currentPly &&
        event.pieceId === piece.id &&
        event.isCapture,
    ).length;
  }
  get lightKingdomFallen(): FallenPiece[] {
    return this.fallenPiecesFor('north');
  }
  get darkKingdomFallen(): FallenPiece[] {
    return this.fallenPiecesFor('south');
  }
  get pipelineVisible(): boolean {
    return this.pipelineSteps.some(
      (step) => this.pipelineState[step.id] !== 'pending',
    );
  }
  get completedPipelineSteps(): number {
    return this.pipelineSteps.filter((step) =>
      ['completed', 'reused'].includes(this.pipelineState[step.id]),
    ).length;
  }
  get formattedGenerationTime(): string {
    const hours = Math.floor(this.generationElapsedSeconds / 3600);
    const minutes = Math.floor((this.generationElapsedSeconds % 3600) / 60);
    const seconds = this.generationElapsedSeconds % 60;
    const clock = `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
    return hours ? `${hours.toString().padStart(2, '0')}:${clock}` : clock;
  }
  pipelineIcon(state: SagaStageState): string {
    if (state === 'completed') return '✓';
    if (state === 'reused') return '↻';
    if (state === 'failed') return '!';
    if (state === 'checking' || state === 'generating') return '●';
    return '○';
  }
  pipelineStatus(state: SagaStageState): string {
    return state === 'reused' ? 'reused' : state;
  }

  submit(): void {
    this.loading = true;
    this.error = null;
    this.storyError = null;
    forkJoin({
      parsed: this.pgnApi.parse(this.pgnText),
      saved: this.pgnApi.createGame(this.pgnText),
    }).subscribe({
      next: ({ parsed, saved }) => {
        this.game = parsed;
        this.gameId = saved.id;
        this.currentPly = 0;
        this.hoveredPieceId = null;
        this.selectedPieceId = null;
        this.fallenRosterOpen = false;
        this.scenes = [];
        this.epilogue = '';
        this.pipelineState = this.initialPipelineState();
        this.resetGenerationTimer();
        this.loading = false;
      },
      error: (error: unknown) => {
        this.loading = false;
        this.error = this.extractError(error, 'Failed to prepare game');
      },
    });
  }

  generateSaga(): void {
    if (!this.gameId) return;
    this.sagaGenerating = true;
    this.startGenerationTimer();
    this.storyError = null;
    this.pipelineState = this.initialPipelineState();
    this.pgnApi
      .generateSaga(this.gameId, (stage, state) => {
        this.pipelineState = { ...this.pipelineState, [stage]: state };
      })
      .subscribe({
        next: (response) => {
          this.scenes = response.sceneBreakdown.data.scenes;
          this.epilogue = response.sceneBreakdown.data.epilogue ?? '';
          this.sagaGenerating = false;
          this.stopGenerationTimer();
        },
        error: (error: unknown) => {
          this.sagaGenerating = false;
          this.stopGenerationTimer();
          this.storyError = this.extractError(error, 'Failed to generate saga');
        },
      });
  }

  ngOnDestroy(): void {
    this.clearGenerationInterval();
  }

  back(): void {
    if (this.canGoBack) this.currentPly -= 1;
  }
  forward(): void {
    if (this.canGoForward) this.currentPly += 1;
  }
  flipBoard(): void {
    this.boardOrientation =
      this.boardOrientation === 'black' ? 'white' : 'black';
  }
  inspectPieceAt(square: string | null): void {
    this.hoveredPieceId = square
      ? (this.piecesBySquare.get(square) ?? null)
      : null;
  }
  selectPieceAt(square: string): void {
    const pieceId = this.piecesBySquare.get(square);
    if (!pieceId) return;
    this.selectedPieceId = this.selectedPieceId === pieceId ? null : pieceId;
  }
  clearSelectedPiece(): void {
    this.selectedPieceId = null;
  }
  toggleFallenRoster(): void {
    this.fallenRosterOpen = !this.fallenRosterOpen;
  }
  closeFallenRoster(): void {
    this.fallenRosterOpen = false;
  }
  pieceKingdom(piece: PieceIdentity): string {
    return piece.side === 'north'
      ? 'Light Kingdom · North'
      : 'Dark Kingdom · South';
  }
  pieceRole(piece: PieceIdentity): string {
    if (piece.chessType === 'p') {
      const promotion = this.currentPromotionFor(piece);
      if (promotion) {
        return `Ascended ${this.displayRole(
          promotion.promotionType ?? piece.fantasyType,
        )}`;
      }
      return this.displayRole(piece.viewpointRole ?? 'company soldier');
    }
    return this.displayRole(piece.fantasyType);
  }
  pieceDescription(piece: PieceIdentity): string {
    if (piece.chessType === 'p') {
      const role = this.displayRole(piece.viewpointRole ?? 'soldier');
      const company = piece.companyName ?? 'their company';
      return !this.currentPromotionFor(piece)
        ? `${role} of ${company}, carrying the company’s story through the battle.`
        : `Once the ${role.toLowerCase()} of ${company}, now transformed without surrendering their former identity.`;
    }
    const descriptions: Record<string, string> = {
      king: 'Bearer of the Royal Seal and living source of the kingdom’s magic.',
      queen:
        'Master swordfighter, Archwizard, and living fortress who moves at magically amplified superhuman speed.',
      archwizard:
        'An Archwizard who folds space and teleports across the battlefield.',
      'moving-fortress': `A colossal mobile stronghold controlled by ${
        piece.operatorName ?? 'a sworn soldier-operator'
      }, who commands every movement and attack from within.`,
      'knight-commander':
        'An elite commander who strikes across the battlefield by unexpected paths.',
    };
    return (
      descriptions[piece.fantasyType] ??
      'A sworn champion whose fate is bound to the kingdom.'
    );
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.game) return;
    if (event.key === 'Escape' && this.fallenRosterOpen) {
      event.preventDefault();
      this.closeFallenRoster();
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && ['TEXTAREA', 'INPUT'].includes(target.tagName)) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.back();
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.forward();
    }
  }

  private introStory(): string {
    return 'After the Calamity, the Light Kingdom of the north and the Dark Kingdom of the south collided. Each king now pours his strength into a Royal Seal while their armies decide which realm will endure.';
  }
  private get finalPlaybackPly(): number {
    if (!this.game) return 0;
    return this.game.positions.length + (this.epilogue ? 1 : 0);
  }
  private fallenPiecesFor(side: 'north' | 'south'): FallenPiece[] {
    if (!this.game) return [];
    const pieces = new Map(
      this.game.ledger.pieces.map((piece) => [piece.id, piece]),
    );
    return this.game.ledger.events
      .filter(
        (event) =>
          event.ply <= this.currentPly &&
          event.isCapture &&
          Boolean(event.capturedPieceId),
      )
      .flatMap((event) => {
        const victim = pieces.get(event.capturedPieceId!);
        const killer = pieces.get(event.pieceId);
        return victim?.side === side && killer
          ? [{ victim, killer, ply: event.ply }]
          : [];
      });
  }
  private get piecesBySquare(): Map<string, string> {
    const pieces = new Map<string, string>();
    if (!this.game) return pieces;
    for (const piece of this.game.ledger.pieces) {
      pieces.set(piece.originalSquare, piece.id);
    }
    for (const event of this.game.ledger.events) {
      if (event.ply > this.currentPly) break;
      if (event.capturedPieceId) {
        for (const [square, pieceId] of pieces) {
          if (pieceId === event.capturedPieceId) {
            pieces.delete(square);
            break;
          }
        }
      }
      pieces.delete(event.from);
      pieces.set(event.to, event.pieceId);
      if (event.isCastle && event.castleSide) {
        const rank = event.side === 'north' ? '1' : '8';
        const rookFrom = `${event.castleSide === 'king' ? 'h' : 'a'}${rank}`;
        const rookTo = `${event.castleSide === 'king' ? 'f' : 'd'}${rank}`;
        const rookId = pieces.get(rookFrom);
        if (rookId) {
          pieces.delete(rookFrom);
          pieces.set(rookTo, rookId);
        }
      }
    }
    return pieces;
  }
  private currentPromotionFor(piece: PieceIdentity): ChessEvent | undefined {
    return this.game?.ledger.events.find(
      (event) =>
        event.ply <= this.currentPly &&
        event.pieceId === piece.id &&
        event.isPromotion,
    );
  }
  private displayRole(role: string): string {
    return role
      .split(/[-\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  private extractError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (Array.isArray(message)) return message.join(', ');
      if (typeof message === 'string') return message;
      return error.message || fallback;
    }
    return fallback;
  }

  private initialPipelineState(): Record<SagaStage, SagaStageState> {
    return {
      analysis: 'pending',
      outline: 'pending',
      story: 'pending',
      validation: 'pending',
      scenes: 'pending',
    };
  }

  private startGenerationTimer(): void {
    this.clearGenerationInterval();
    this.generationElapsedSeconds = 0;
    this.generationStartedAt = Date.now();
    this.generationTimer = setInterval(() => {
      if (this.generationStartedAt === null) return;
      this.generationElapsedSeconds = Math.floor(
        (Date.now() - this.generationStartedAt) / 1000,
      );
    }, 1000);
  }

  private stopGenerationTimer(): void {
    if (this.generationStartedAt !== null) {
      this.generationElapsedSeconds = Math.floor(
        (Date.now() - this.generationStartedAt) / 1000,
      );
    }
    this.generationStartedAt = null;
    this.clearGenerationInterval();
  }

  private resetGenerationTimer(): void {
    this.generationStartedAt = null;
    this.generationElapsedSeconds = 0;
    this.clearGenerationInterval();
  }

  private clearGenerationInterval(): void {
    if (this.generationTimer === null) return;
    clearInterval(this.generationTimer);
    this.generationTimer = null;
  }
}
