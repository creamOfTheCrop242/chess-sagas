import {
  renderSagaShare,
  shareBoardSquares,
  SagaShareSnapshot,
} from './saga-share';
import { SagaShareComponent } from './saga-share.component';
import { PgnViewerComponent } from './pgn-viewer.component';
import type { PgnApiService } from './pgn-api.service';
import type { ParsedPgn } from './pgn.models';
import { of } from 'rxjs';

const snapshot: SagaShareSnapshot = {
  url: 'https://chesssagas.com/records/test?beat=1&piece=w-p-e2',
  title: 'Light Kingdom vs Dark Kingdom',
  page: 'Beat 1',
  location: 'The Drowned City',
  fen: '8/8/8/8/4P3/8/8/8 w - - 0 1',
  orientation: 'black',
  activeSquare: 'e4',
  selectedSquare: 'e4',
  story: 'Mara refused to leave.',
  character: null,
};

describe('share board layout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('renders the selected piece, board, and complete story into a PNG', async () => {
    const context = {
      font: '',
      fillStyle: '',
      textBaseline: '',
      strokeStyle: '',
      lineWidth: 0,
      measureText: (text: string) => ({ width: text.length * 12 }),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['png'], { type: 'image/png' })),
    );
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      backgroundImage: 'url("data:image/svg+xml;base64,PHN2Zy8+")',
    } as CSSStyleDeclaration);
    vi.stubGlobal(
      'Image',
      class {
        onload?: () => void;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    const blob = await renderSagaShare({
      ...snapshot,
      capture: {
        victim: 'Nessa · Pawn · Dark Kingdom',
        captor: 'Mara',
        symbol: 'p',
        square: 'd5',
        enPassant: false,
      },
      character: {
        name: 'Mara',
        role: 'Shield bearer',
        description: 'She joined to find her brother.',
        status: 'Unharmed',
      },
    });
    expect(blob.type).toBe('image/png');
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.strokeRect).toHaveBeenCalledTimes(1);
    const text = context.fillText.mock.calls.map((call) => call[0]).join(' ');
    expect(text).toContain(snapshot.story);
    expect(text).toContain('Mara');
    expect(text).toContain('Status at this beat: Unharmed');
    expect(text).toContain('Captured this beat');
    expect(text).toContain('Nessa · Pawn · Dark Kingdom');
    expect(text).toContain('Taken by Mara');
    expect(document.querySelector('.cg-wrap')).toBeNull();
  });
  it('preserves pieces and orientation without a live board DOM', () => {
    const black = shareBoardSquares(snapshot.fen, 'black');
    expect(black).toHaveLength(64);
    expect(black[0].square).toBe('h1');
    expect(black.find((s) => s.piece === 'P')).toMatchObject({
      square: 'e4',
      row: 3,
      col: 3,
    });
    const white = shareBoardSquares(snapshot.fen, 'white');
    expect(white[0].square).toBe('a8');
    expect(white.find((s) => s.piece === 'P')).toMatchObject({
      square: 'e4',
      row: 4,
      col: 4,
    });
    expect(white.find((s) => s.square === 'a1')?.light).toBe(false);
  });
});

describe('sharing controls', () => {
  afterEach(() => vi.restoreAllMocks());
  it('shares the prepared image and exact replay URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    });
    const component = new SagaShareComponent();
    component.shared = snapshot;
    component.file = new File(['image'], 'beat.png', { type: 'image/png' });
    await component.share();
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ files: [component.file], url: snapshot.url }),
    );
  });
  it('does not treat cancellation as an error or trigger another share', async () => {
    const share = vi
      .fn()
      .mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    Object.defineProperty(navigator, 'share', {
      value: share,
      configurable: true,
    });
    const component = new SagaShareComponent();
    component.shared = snapshot;
    component.file = new File(['image'], 'beat.png');
    await component.share();
    expect(component.message).toBe('');
    expect(share).toHaveBeenCalledTimes(1);
  });
  it('provides a selectable URL if clipboard permission is denied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const component = new SagaShareComponent();
    component.shared = snapshot;
    await component.copyLink();
    expect(component.copyFallback).toBe(true);
    expect(component.shared.url).toBe(snapshot.url);
  });
});

describe('shared replay restoration', () => {
  const game = {
    headers: {},
    realms: { white: 'Light Kingdom', black: 'Dark Kingdom' },
    startFen: snapshot.fen,
    positions: [{ ply: 1, fen: snapshot.fen, to: 'e4', san: 'e4' }],
    ledger: {
      finalFen: snapshot.fen,
      events: [],
      pieces: [{ id: 'w-p-e2', permanentName: 'Mara' }],
    },
  } as unknown as ParsedPgn;
  function replay(query: Record<string, string>) {
    const api = {
      getRecord: () =>
        of({
          id: 'test',
          rawPgn: '',
          ledger: { data: game.ledger },
          sceneBreakdown: {
            data: {
              scenes: [
                { startPly: 1, endPly: 1, fantasyNarration: snapshot.story },
              ],
              epilogue: 'Aftermath',
              laterEpilogue: 'Later',
            },
          },
        }),
      parse: () => of(structuredClone(game)),
    } as unknown as PgnApiService;
    const route = {
      snapshot: {
        paramMap: { get: () => 'test' },
        queryParamMap: { get: (key: string) => query[key] ?? null },
      },
    } as never;
    const viewer = new PgnViewerComponent(api, route);
    viewer.ngOnInit();
    return viewer;
  }
  afterEach(() =>
    localStorage.removeItem('chess-sagas:reading-bookmark:v1:test'),
  );
  it('overrides an old bookmark and restores the selected piece and orientation', () => {
    localStorage.setItem(
      'chess-sagas:reading-bookmark:v1:test',
      JSON.stringify({ page: 'later-chronicles' }),
    );
    const viewer = replay({ beat: '1', piece: 'w-p-e2', orientation: 'white' });
    expect(viewer.currentPly).toBe(1);
    expect(viewer.selectedPieceId).toBe('w-p-e2');
    expect(viewer.boardOrientation).toBe('white');
    expect(viewer.currentStory).toBe(snapshot.story);
  });
  it.each(['-1', '999', 'NaN', '1.5', ''])(
    'ignores invalid beat %s',
    (beat) => {
      expect(replay({ beat }).currentPly).toBe(0);
    },
  );
  it('supports ending pages without accepting unknown characters', () => {
    const viewer = replay({ beat: '3', piece: 'unknown' });
    expect(viewer.isLaterChroniclePage).toBe(true);
    expect(viewer.selectedPieceId).toBeNull();
  });
});
