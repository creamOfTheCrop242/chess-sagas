import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ChessboardComponent } from './chessboard.component';
import { PgnApiService } from './pgn-api.service';
import {
  ParsedPgn,
  ParsedPosition,
  PlaybackScene,
  SagaStage,
  SagaStageState,
} from './pgn.models';

@Component({
  selector: 'app-pgn-viewer',
  standalone: true,
  imports: [FormsModule, ChessboardComponent],
  templateUrl: './pgn-viewer.component.html',
  styleUrl: './pgn-viewer.component.css',
})
export class PgnViewerComponent {
  pgnText = '';
  loading = false;
  error: string | null = null;
  game: ParsedPgn | null = null;
  gameId: string | null = null;
  currentPly = 0;
  scenes: PlaybackScene[] = [];
  sagaGenerating = false;
  storyError: string | null = null;
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
    return this.currentPly === 0
      ? this.game.startFen
      : this.game.positions[this.currentPly - 1].fen;
  }
  get currentMove(): ParsedPosition | null {
    return !this.game || this.currentPly === 0
      ? null
      : this.game.positions[this.currentPly - 1];
  }
  get currentMoveLabel(): string {
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
    return !!this.game && this.currentPly < this.game.positions.length;
  }
  get currentScene(): PlaybackScene | null {
    if (this.currentPly <= 0) return null;
    return (
      this.scenes.find(
        (scene) =>
          this.currentPly >= scene.startPly && this.currentPly <= scene.endPly,
      ) ?? null
    );
  }
  get currentStory(): string {
    if (this.currentPly === 0) return this.introStory();
    return this.currentScene?.fantasyNarration ?? '';
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
        this.scenes = [];
        this.pipelineState = this.initialPipelineState();
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
    this.storyError = null;
    this.pipelineState = this.initialPipelineState();
    this.pgnApi
      .generateSaga(this.gameId, (stage, state) => {
        this.pipelineState = { ...this.pipelineState, [stage]: state };
      })
      .subscribe({
        next: (response) => {
          this.scenes = response.sceneBreakdown.data.scenes;
          this.sagaGenerating = false;
        },
        error: (error: unknown) => {
          this.sagaGenerating = false;
          this.storyError = this.extractError(error, 'Failed to generate saga');
        },
      });
  }

  back(): void {
    if (this.canGoBack) this.currentPly -= 1;
  }
  forward(): void {
    if (this.canGoForward) this.currentPly += 1;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.game) return;
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
}
