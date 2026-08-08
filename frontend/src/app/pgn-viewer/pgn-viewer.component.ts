import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  Optional,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { BillingClientService } from '../billing/billing.service';
import { AuthService } from '../auth/auth.service';
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
  StoryWound,
  BattlefieldEnvironment,
  SceneBreakdownResponse,
} from './pgn.models';

type FallenPiece = {
  victim: PieceIdentity;
  killer: PieceIdentity;
  ply: number;
};

type PieceStatus = {
  label: string;
  detail: string | null;
  tone: 'healthy' | 'wounded' | 'maimed' | 'dead' | 'entombed';
};

type PieceFate = {
  killerName: string;
  beat: number;
  account: string;
  finalCondition: string | null;
};

type WoundHistoryEntry = {
  inflictedAtPly: number;
  injury: string;
  effects: string[];
  state: 'active' | 'recovered';
  recoveryPly: number | null;
};

@Component({
  selector: 'app-pgn-viewer',
  standalone: true,
  imports: [FormsModule, RouterLink, ChessboardComponent],
  templateUrl: './pgn-viewer.component.html',
  styleUrl: './pgn-viewer.component.css',
})
export class PgnViewerComponent implements OnInit, OnDestroy {
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
  rosterPieceId: string | null = null;
  scenes: PlaybackScene[] = [];
  wounds: StoryWound[] = [];
  epilogue = '';
  laterEpilogueHeading = '';
  laterEpilogue = '';
  defeatedKingDeathDescription = '';
  defeatedKingFate = '';
  defeatedSealFate: 'destroyed' | 'intact' | '' = '';
  battlefieldEnvironment: BattlefieldEnvironment | null = null;
  sagaGenerating = false;
  storyError: string | null = null;
  recordReplay = false;
  generationElapsedSeconds = 0;
  billingFailure: 'signin' | 'credits' | null = null;
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

  constructor(
    private readonly pgnApi: PgnApiService,
    @Optional() private readonly route?: ActivatedRoute,
    @Optional() private readonly billing?: BillingClientService,
    @Optional() private readonly auth?: AuthService,
  ) {}

  ngOnInit(): void {
    const recordId = this.route?.snapshot.paramMap.get('id');
    if (recordId) {
      this.loadArchivedRecord(recordId);
    } else if (this.isPageReload()) {
      this.pgnText = '';
      this.pgnApi.forgetRecentGeneration();
    } else {
      this.restoreRecentGeneration();
    }
  }

  private isPageReload(): boolean {
    const navigation = performance.getEntriesByType?.('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    return navigation?.type === 'reload';
  }

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
  get currentBeatSquare(): string | null {
    return this.currentMove?.to ?? null;
  }
  get currentMoveLabel(): string {
    if (this.isAftermathPage) return 'Immediate Aftermath';
    if (this.isLaterChroniclePage) return 'Later Chronicles';
    const move = this.currentMove;
    if (!move) return 'Start position';
    const number = Math.ceil(move.ply / 2);
    return move.ply % 2 ? `${number}. ${move.san}` : `${number}... ${move.san}`;
  }
  get gameTitle(): string {
    if (!this.game) return '';
    return `${this.game.realms.white} vs ${this.game.realms.black}`;
  }
  get canGoBack(): boolean {
    return !!this.game && this.currentPly > 0;
  }
  get canGoForward(): boolean {
    return !!this.game && this.currentPly < this.finalPlaybackPly;
  }
  get isEpiloguePage(): boolean {
    return this.isAftermathPage || this.isLaterChroniclePage;
  }
  get isAftermathPage(): boolean {
    return (
      !!this.game &&
      Boolean(this.epilogue) &&
      this.currentPly === this.game.positions.length + 1
    );
  }
  get isLaterChroniclePage(): boolean {
    if (!this.game || !this.laterEpilogue) return false;
    const offset = this.epilogue ? 2 : 1;
    return this.currentPly === this.game.positions.length + offset;
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
    if (this.isAftermathPage) return this.epilogue;
    if (this.isLaterChroniclePage) return this.laterEpilogue;
    return this.currentScene?.fantasyNarration ?? '';
  }
  get epilogueParagraphs(): string[] {
    return this.storyParagraphs(this.epilogue);
  }
  get laterEpilogueParagraphs(): string[] {
    return this.storyParagraphs(this.laterEpilogue);
  }
  private storyParagraphs(story: string): string[] {
    if (!story.trim()) return [];
    return story
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
    const pieceId = this.selectedPieceId ?? this.hoveredPieceId;
    return (
      this.game.ledger.pieces.find((piece) => piece.id === pieceId) ?? null
    );
  }
  get inspectedPieceKills(): number {
    const piece = this.inspectedPiece;
    return piece ? this.pieceKills(piece) : 0;
  }
  pieceKills(piece: PieceIdentity): number {
    if (!this.game) return 0;
    return this.game.ledger.events.filter(
      (event) =>
        event.ply <= this.currentPly &&
        event.pieceId === piece.id &&
        event.isCapture,
    ).length;
  }
  get inspectedPieceStatus(): PieceStatus {
    const piece = this.inspectedPiece;
    return piece
      ? this.pieceStatus(piece)
      : { label: 'Unharmed', detail: null, tone: 'healthy' };
  }
  pieceStatus(piece: PieceIdentity): PieceStatus {
    if (!this.game) {
      return { label: 'Unharmed', detail: null, tone: 'healthy' };
    }
    const checkmateDeathPly = this.checkmateDeathPlyFor(piece);
    if (checkmateDeathPly !== null && this.currentPly >= checkmateDeathPly) {
      return {
        label: 'Dead',
        detail:
          this.defeatedKingDeathDescription ||
          `Fell with the Royal Seal at beat ${checkmateDeathPly}.`,
        tone: 'dead',
      };
    }
    if (
      this.isEpiloguePage &&
      piece.chessType === 'k' &&
      this.isDefeatedPiece(piece) &&
      this.defeatedKingDeathDescription
    ) {
      return {
        label: 'Dead',
        detail: this.defeatedKingDeathDescription,
        tone: 'dead',
      };
    }
    const capturedAtPly =
      piece.capturedAtPly ??
      this.game.ledger.events.find(
        (event) => event.capturedPieceId === piece.id,
      )?.ply;
    if (capturedAtPly && capturedAtPly <= this.currentPly) {
      return {
        label: 'Dead',
        detail: `Fell at beat ${capturedAtPly}.`,
        tone: 'dead',
      };
    }
    if (this.hasFortressEntombmentThreat(piece)) {
      return {
        label: 'Entombment Threat',
        detail:
          'The broken Seal’s fading magic threatens to lock the embedded pilot inside the Fortress.',
        tone: 'entombed',
      };
    }
    const visibleWounds = this.visibleWoundsFor(piece);
    const kingStrain = this.kingStrainFor(piece);
    if (!visibleWounds.length) {
      return kingStrain ?? { label: 'Unharmed', detail: null, tone: 'healthy' };
    }
    const activeWounds = visibleWounds.filter(
      (wound) =>
        wound.recoveryPly === null || this.currentPly < wound.recoveryPly,
    );
    const recoveredCount = visibleWounds.length - activeWounds.length;
    if (!activeWounds.length) {
      return {
        label: 'Scarred',
        detail: `${recoveredCount} healed ${
          recoveredCount === 1 ? 'wound' : 'wounds'
        }; scars remain.`,
        tone: 'wounded',
      };
    }
    const latestWound = activeWounds[activeWounds.length - 1];
    const injury = this.safeWoundInjury(latestWound, piece);
    const effects = latestWound.lastingEffects
      .filter((effect) => this.isSafeWoundStatusText(effect, piece))
      .join(' · ');
    const summary =
      activeWounds.length === 1 && recoveredCount === 0
        ? effects
          ? `${injury} · ${effects}`
          : injury
        : `${activeWounds.length} active ${
            activeWounds.length === 1 ? 'injury' : 'injuries'
          }${
            recoveredCount
              ? ` · ${recoveredCount} healed ${
                  recoveredCount === 1 ? 'scar' : 'scars'
                }`
              : ''
          }`;
    const combinedSummary = kingStrain?.detail
      ? `${summary} · ${kingStrain.detail}`
      : summary;
    if (activeWounds.some((wound) => this.isMaimingInjury(wound.injury))) {
      return {
        label: 'Maimed',
        detail: combinedSummary,
        tone: 'maimed',
      };
    }
    const gravelyWounded = activeWounds.some((wound) =>
      this.isGraveInjury(`${wound.injury} ${wound.lastingEffects.join(' ')}`),
    );
    return {
      label:
        gravelyWounded || this.kingCheckEvents(piece).length >= 4
          ? 'Gravely Wounded'
          : 'Wounded',
      detail: combinedSummary,
      tone: 'wounded',
    };
  }
  pieceFate(piece: PieceIdentity): PieceFate | null {
    if (!this.game || this.pieceStatus(piece).tone !== 'dead') return null;

    const capture = this.game.ledger.events.find(
      (event) =>
        event.capturedPieceId === piece.id && event.ply <= this.currentPly,
    );
    const checkmate =
      piece.chessType === 'k' && this.isDefeatedPiece(piece)
        ? this.game.ledger.events.find(
            (event) => event.isCheckmate && event.ply <= this.currentPly,
          )
        : undefined;
    const deathEvent = capture ?? checkmate;
    if (!deathEvent) {
      if (!this.isEpiloguePage || !this.defeatedKingDeathDescription)
        return null;
      return {
        killerName: 'The victorious kingdom',
        beat: this.game.positions.length,
        account: this.defeatedKingDeathDescription,
        finalCondition: this.finalWoundCondition(piece),
      };
    }

    const killer = this.game.ledger.pieces.find(
      (candidate) => candidate.id === deathEvent.pieceId,
    );
    const scene = this.scenes.find(
      (candidate) =>
        deathEvent.ply >= candidate.startPly &&
        deathEvent.ply <= candidate.endPly &&
        (candidate.captureVictimId === undefined ||
          candidate.captureVictimId === null ||
          candidate.captureVictimId === piece.id),
    );
    return {
      killerName: killer?.permanentName ?? 'An unknown enemy',
      beat: deathEvent.ply,
      account:
        (checkmate ? this.defeatedKingDeathDescription : '') ||
        scene?.fantasyNarration ||
        `${piece.permanentName} fell during the clash at beat ${deathEvent.ply}.`,
      finalCondition: this.finalWoundCondition(piece),
    };
  }
  get inspectedPieceWoundHistory(): WoundHistoryEntry[] {
    const piece = this.inspectedPiece;
    if (!piece) return [];
    const woundHistory = this.visibleWoundsFor(piece).map((wound) => ({
      inflictedAtPly: wound.inflictedAtPly,
      injury: this.safeWoundInjury(wound, piece),
      effects: wound.lastingEffects.filter((effect) =>
        this.isSafeWoundStatusText(effect, piece),
      ),
      state:
        wound.recoveryPly !== null && this.currentPly >= wound.recoveryPly
          ? ('recovered' as const)
          : ('active' as const),
      recoveryPly: wound.recoveryPly,
    }));
    const strainHistory = this.kingCheckEvents(piece).map((event, index) => ({
      inflictedAtPly: event.ply,
      injury: this.kingStrainLabel(index + 1),
      effects: [this.kingStrainEffect(index + 1)],
      state: 'active' as const,
      recoveryPly: null,
    }));
    return [...woundHistory, ...strainHistory]
      .sort((left, right) => left.inflictedAtPly - right.inflictedAtPly)
      .reverse();
  }
  get lightKingdomFallen(): FallenPiece[] {
    return this.fallenPiecesFor('north');
  }
  get darkKingdomFallen(): FallenPiece[] {
    return this.fallenPiecesFor('south');
  }
  get lightKingdomRoster(): PieceIdentity[] {
    return this.rosterFor('north');
  }
  get darkKingdomRoster(): PieceIdentity[] {
    return this.rosterFor('south');
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
  get storyRetrying(): boolean {
    return this.pipelineState.story === 'retrying';
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
    if (state === 'checking' || state === 'generating' || state === 'retrying')
      return '●';
    return '○';
  }
  pipelineStatus(state: SagaStageState): string {
    if (state === 'reused') return 'reused';
    if (state === 'retrying') return 'correcting and retrying';
    return state;
  }

  submit(): void {
    this.loading = true;
    this.error = null;
    this.storyError = null;
    this.billingFailure = null;
    const billing = this.billing?.status();
    const needsCredit = Boolean(
      billing?.enforcementEnabled &&
      !billing.unlimited &&
      (billing.available ?? 0) < 1,
    );
    const needsSignIn = Boolean(this.auth && !this.auth.user());
    const needsAccessCheck = needsCredit || needsSignIn;
    forkJoin({
      parsed: this.pgnApi.parse(this.pgnText),
      saved: this.pgnApi.createGame(this.pgnText),
    })
      .pipe(
        switchMap(({ parsed, saved }) =>
          needsAccessCheck
            ? this.pgnApi.getGenerationStatus(saved.id).pipe(
                map((status) => ({
                  parsed,
                  saved,
                  reusable: status.stages.scenes,
                })),
              )
            : of({ parsed, saved, reusable: false }),
        ),
      )
      .subscribe({
        next: ({ parsed, saved, reusable }) => {
          if (needsAccessCheck && !reusable) {
            this.loading = false;
            this.billingFailure = needsSignIn ? 'signin' : 'credits';
            return;
          }
          this.game = { ...parsed, ledger: saved.ledger.data };
          this.gameId = saved.id;
          this.currentPly = 0;
          this.hoveredPieceId = null;
          this.selectedPieceId = null;
          this.fallenRosterOpen = false;
          this.scenes = [];
          this.wounds = [];
          this.epilogue = '';
          this.laterEpilogueHeading = '';
          this.laterEpilogue = '';
          this.defeatedKingDeathDescription = '';
          this.defeatedKingFate = '';
          this.defeatedSealFate = '';
          this.battlefieldEnvironment = null;
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

  private loadArchivedRecord(recordId: string): void {
    this.recordReplay = true;
    this.loading = true;
    this.error = null;
    this.pgnApi
      .getRecord(recordId)
      .pipe(
        switchMap((record) =>
          forkJoin({
            record: of(record),
            parsed: this.pgnApi.parse(record.rawPgn),
          }),
        ),
      )
      .subscribe({
        next: ({ record, parsed }) => {
          const playback = record.sceneBreakdown.data;
          this.pgnText = record.rawPgn;
          this.game = { ...parsed, ledger: record.ledger.data };
          this.gameId = record.id;
          this.currentPly = 0;
          this.scenes = playback.scenes;
          this.battlefieldEnvironment = record.battlefieldEnvironment ?? null;
          this.wounds = playback.wounds ?? [];
          this.epilogue = playback.epilogue ?? '';
          this.laterEpilogueHeading = playback.laterEpilogueHeading ?? '';
          this.laterEpilogue = playback.laterEpilogue ?? '';
          this.defeatedKingDeathDescription =
            playback.defeatedKingDeathDescription ?? '';
          this.defeatedKingFate = playback.defeatedKingFate ?? '';
          this.defeatedSealFate = playback.defeatedSealFate ?? '';
          this.loading = false;
        },
        error: (error: unknown) => {
          this.loading = false;
          this.error = this.extractError(error, 'Failed to open this record');
        },
      });
  }

  generateSaga(): void {
    if (!this.gameId) return;
    this.watchSagaGeneration();
  }

  private watchSagaGeneration(): void {
    if (!this.gameId) return;
    this.sagaGenerating = true;
    this.startGenerationTimer();
    this.storyError = null;
    this.billingFailure = null;
    this.pipelineState = this.initialPipelineState();
    this.pgnApi
      .generateSaga(this.gameId, (stage, state) => {
        this.pipelineState = { ...this.pipelineState, [stage]: state };
      })
      .subscribe({
        next: (response) => {
          this.applySagaResponse(response);
          this.sagaGenerating = false;
          this.stopGenerationTimer();
          this.billing?.refresh();
        },
        error: (error: unknown) => {
          this.sagaGenerating = false;
          this.stopGenerationTimer();
          this.billing?.refresh();
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.billingFailure = 'signin';
            this.storyError = 'Sign in to forge a new saga.';
            return;
          }
          if (error instanceof HttpErrorResponse && error.status === 402) {
            this.billingFailure = 'credits';
            this.storyError =
              'A saga credit is required to begin this chronicle.';
            return;
          }
          this.storyError = `Saga generation could not finish. Select “Retry saga generation” to try again. ${this.extractError(
            error,
            'The story could not pass validation.',
          )}`;
        },
      });
  }

  private restoreRecentGeneration(): void {
    const gameId = this.pgnApi.recentGenerationGameId();
    if (!gameId) return;
    this.loading = true;
    this.pgnApi
      .getGame(gameId)
      .pipe(
        switchMap((saved) =>
          forkJoin({
            saved: of(saved),
            parsed: this.pgnApi.parse(saved.rawPgn),
          }),
        ),
      )
      .subscribe({
        next: ({ saved, parsed }) => {
          this.pgnText = saved.rawPgn;
          this.game = { ...parsed, ledger: saved.ledger.data };
          this.gameId = saved.id;
          this.currentPly = 0;
          this.loading = false;
          this.watchSagaGeneration();
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  private applySagaResponse(response: SceneBreakdownResponse): void {
    this.battlefieldEnvironment = response.battlefieldEnvironment ?? null;
    this.scenes = response.sceneBreakdown.data.scenes;
    this.wounds = response.sceneBreakdown.data.wounds ?? [];
    this.epilogue = response.sceneBreakdown.data.epilogue ?? '';
    this.laterEpilogueHeading =
      response.sceneBreakdown.data.laterEpilogueHeading ?? '';
    this.laterEpilogue = response.sceneBreakdown.data.laterEpilogue ?? '';
    this.defeatedKingDeathDescription =
      response.sceneBreakdown.data.defeatedKingDeathDescription ?? '';
    this.defeatedKingFate = response.sceneBreakdown.data.defeatedKingFate ?? '';
    this.defeatedSealFate = response.sceneBreakdown.data.defeatedSealFate ?? '';
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
    this.hoveredPieceId = null;
    this.selectedPieceId = pieceId;
  }
  clearSelectedPiece(): void {
    this.selectedPieceId = null;
    this.hoveredPieceId = null;
  }
  toggleFallenRoster(): void {
    this.fallenRosterOpen = !this.fallenRosterOpen;
    if (!this.fallenRosterOpen) this.rosterPieceId = null;
  }
  closeFallenRoster(): void {
    this.fallenRosterOpen = false;
    this.rosterPieceId = null;
  }
  toggleRosterPiece(piece: PieceIdentity): void {
    this.rosterPieceId = this.rosterPieceId === piece.id ? null : piece.id;
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
    if (piece.backstory) return piece.backstory;
    if (piece.chessType === 'p') {
      const role = this.displayRole(piece.viewpointRole ?? 'soldier');
      const company = piece.companyName ?? 'their company';
      return !this.currentPromotionFor(piece)
        ? `${role} of ${company}, carrying the company’s story through the battle.`
        : `Once the ${role.toLowerCase()} of ${company}, now transformed without surrendering their former identity.`;
    }
    const descriptions: Record<string, string> = {
      king: 'A supreme warrior-sorcerer who reaches across universes and channels the lost homeland’s magic into the Royal Seal.',
      queen:
        'Trained from birth by the King, Archwizards, Knight Commanders, and soldier companies. Her magically augmented body can wear nearly indestructible Moving-Fortress armor while fighting with superhuman strength and speed.',
      archwizard:
        'A master of elemental forces, wards, bindings, counterspells, illusions, divination, transmutation, and other high sorcery who uses teleportation to cross the battlefield.',
      'moving-fortress': `A colossal mobile stronghold controlled by ${
        piece.operatorName ?? 'a sworn pilot'
      }, a soldier wounded beyond healing whose body was permanently placed in its armored command cradle. The pilot cannot live without the machine’s magic life-supporting core and commands its enormous wheels and magic-round weapons from within.`,
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
    return 'This battle record reveals the final battle of one fractured reality. An unknown age after the Calamity merged the Light Kingdom and Dark Kingdom onto one plane, each King fed his Royal Seal by siphoning magic from a different universe. The incompatible currents splintered reality itself, leaving this version of their armies to decide which realm will endure.';
  }
  private get finalPlaybackPly(): number {
    if (!this.game) return 0;
    return (
      this.game.positions.length +
      (this.epilogue ? 1 : 0) +
      (this.laterEpilogue ? 1 : 0)
    );
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
  private rosterFor(side: 'north' | 'south'): PieceIdentity[] {
    return (this.game?.ledger.pieces ?? [])
      .filter((piece) => piece.side === side)
      .sort((left, right) =>
        left.originalSquare.localeCompare(right.originalSquare),
      );
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
  private hasFortressEntombmentThreat(piece: PieceIdentity): boolean {
    if (!this.isEpiloguePage || !piece.alive) return false;
    const isFortress =
      piece.fantasyType === 'moving-fortress' ||
      this.currentPromotionFor(piece)?.promotionType === 'moving-fortress';
    if (!isFortress) return false;
    const result = String(
      this.game?.ledger.metadata['result'] ??
        this.game?.headers['Result'] ??
        '',
    );
    const sealDestroyed = this.defeatedSealFate
      ? this.defeatedSealFate === 'destroyed'
      : this.game?.ledger.metadata['termination'] === 'checkmate';
    const defeatedSide =
      result === '1-0' ? 'south' : result === '0-1' ? 'north' : null;
    return sealDestroyed && piece.side === defeatedSide;
  }
  private isDefeatedPiece(piece: PieceIdentity): boolean {
    const result = String(
      this.game?.ledger.metadata['result'] ??
        this.game?.headers['Result'] ??
        '',
    );
    return (
      (result === '1-0' && piece.side === 'south') ||
      (result === '0-1' && piece.side === 'north')
    );
  }
  private checkmateDeathPlyFor(piece: PieceIdentity): number | null {
    if (!this.game || piece.chessType !== 'k') return null;
    const checkmateEvent = this.game.ledger.events.find(
      (event) => event.isCheckmate,
    );
    if (!checkmateEvent) return null;
    const result = String(
      this.game.ledger.metadata['result'] ?? this.game.headers['Result'] ?? '',
    );
    const defeatedSide =
      result === '1-0' ? 'south' : result === '0-1' ? 'north' : null;
    return piece.side === defeatedSide ? checkmateEvent.ply : null;
  }
  private isMaimingInjury(injury: string): boolean {
    return /\b(amput\w*|dismember\w*|sever\w*|missing|lost (?:an? |the )?(?:arm|hand|leg|foot)|torn off)\b/i.test(
      injury,
    );
  }
  private isGraveInjury(injury: string): boolean {
    return /\b(grave|critical|crippl|organ|spine|skull)\b/i.test(injury);
  }
  private kingCheckEvents(piece: PieceIdentity): ChessEvent[] {
    if (!this.game || piece.chessType !== 'k') return [];
    return this.game.ledger.events.filter(
      (event) =>
        event.ply <= this.currentPly &&
        event.isCheck &&
        event.side !== piece.side,
    );
  }
  private kingStrainFor(piece: PieceIdentity): PieceStatus | null {
    const count = this.kingCheckEvents(piece).length;
    if (!count) return null;
    const label =
      count === 1
        ? 'Strained'
        : count === 2
          ? 'Battered'
          : count === 3
            ? 'Wounded'
            : 'Gravely Wounded';
    return {
      label,
      detail: `${count} direct ${count === 1 ? 'threat has' : 'threats have'} damaged the King's wards and strained his connection to the Royal Seal.`,
      tone: 'wounded',
    };
  }
  private kingStrainLabel(count: number): string {
    if (count === 1) return 'The Royal Seal wards absorbed a damaging impact.';
    if (count === 2) return 'A second assault battered the Royal Seal wards.';
    if (count === 3)
      return 'Repeated attacks wounded the King through the Seal bond.';
    return 'Another direct assault deepened the King’s accumulated damage.';
  }
  private kingStrainEffect(count: number): string {
    if (count === 1) return 'The inter-universal connection begins to falter.';
    if (count === 2)
      return 'Maintaining the realm’s magic demands visible effort.';
    if (count === 3) return 'Pain and magical exhaustion hinder concentration.';
    return 'The failing wards and cumulative strain leave the King near collapse.';
  }
  private visibleWoundsFor(piece: PieceIdentity): StoryWound[] {
    return this.wounds
      .filter(
        (wound) =>
          wound.pieceId === piece.id && wound.inflictedAtPly <= this.currentPly,
      )
      .sort((left, right) => left.inflictedAtPly - right.inflictedAtPly);
  }
  private finalWoundCondition(piece: PieceIdentity): string | null {
    const wounds = this.visibleWoundsFor(piece);
    if (!wounds.length) return null;
    const wound = wounds[wounds.length - 1];
    const effects = wound.lastingEffects
      .filter((effect) => this.isSafeWoundStatusText(effect, piece))
      .join(' · ');
    const injury = this.safeWoundInjury(wound, piece);
    return effects ? `${injury} · ${effects}` : injury;
  }
  private safeWoundInjury(wound: StoryWound, piece: PieceIdentity): string {
    return this.isSafeWoundStatusText(wound.injury, piece)
      ? wound.injury
      : `Injured during the capture at beat ${wound.inflictedAtPly}.`;
  }
  private isSafeWoundStatusText(
    text: string,
    inspectedPiece: PieceIdentity,
  ): boolean {
    if (!this.game) return false;
    if (/\b[wb]-[pnbrqk]-[a-h][1-8]\b|\bply\b|\b[a-h][1-8]\b/i.test(text)) {
      return false;
    }
    const inspectedNames = new Set(
      [
        inspectedPiece.permanentName,
        inspectedPiece.viewpointName,
        inspectedPiece.operatorName,
        inspectedPiece.companyName,
      ]
        .filter((name): name is string => Boolean(name))
        .map((name) => name.toLowerCase()),
    );
    return !this.game.ledger.pieces
      .flatMap((piece) => [
        piece.permanentName,
        piece.viewpointName,
        piece.operatorName,
        piece.companyName,
      ])
      .filter(
        (name): name is string =>
          typeof name === 'string' &&
          name.length > 0 &&
          !inspectedNames.has(name.toLowerCase()),
      )
      .some((name) => {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?:^|[^A-Za-z])${escaped}(?:$|[^A-Za-z])`, 'i').test(
          text,
        );
      });
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
