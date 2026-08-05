import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import type { Key, KeyedNode } from 'chessground/types';

@Component({
  selector: 'app-chessboard',
  standalone: true,
  template: `<div
    #board
    class="board"
    (pointerdown)="beginTouchSelection($event)"
    (pointermove)="inspectPointerTarget($event)"
    (pointerup)="finishTouchSelection($event)"
    (pointercancel)="cancelTouchSelection()"
    (pointerleave)="pieceHovered.emit(null)"
    (click)="selectPointerTarget($event)"
    (focusin)="inspectFocusTarget($event)"
    (focusout)="pieceHovered.emit(null)"
    (keydown)="selectFocusedPiece($event)"
  ></div>`,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 480px;
      }

      .board {
        width: 100%;
        aspect-ratio: 1 / 1;
        box-shadow: inset 0 0 0 1px rgba(232, 228, 216, 0.08);
      }

      :host ::ng-deep cg-container {
        width: 100%;
        height: 100%;
      }

      :host ::ng-deep coords {
        color: rgba(228, 208, 154, 0.75) !important;
        font-family: Cinzel, serif !important;
      }

      :host ::ng-deep piece {
        pointer-events: auto;
        cursor: pointer;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }

      :host ::ng-deep square.beat-active {
        background: radial-gradient(
          circle,
          rgba(235, 205, 116, 0.2) 28%,
          rgba(202, 157, 55, 0.68) 100%
        ) !important;
        box-shadow:
          inset 0 0 0 4px rgba(255, 224, 132, 0.9),
          inset 0 0 18px rgba(255, 205, 74, 0.7);
        animation: beat-piece-glow 1.6s ease-in-out infinite;
      }

      @keyframes beat-piece-glow {
        50% {
          filter: brightness(1.25);
          box-shadow:
            inset 0 0 0 5px rgba(255, 235, 170, 1),
            inset 0 0 24px rgba(255, 205, 74, 0.9);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        :host ::ng-deep square.beat-active {
          animation: none;
        }
      }
    `,
  ],
})
export class ChessboardComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @ViewChild('board', { static: true }) boardEl!: ElementRef<HTMLDivElement>;

  @Input() fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  @Input() orientation: 'white' | 'black' = 'black';
  @Input() activeSquare: string | null = null;
  @Output() pieceHovered = new EventEmitter<string | null>();
  @Output() pieceSelected = new EventEmitter<string>();

  private ground: Api | null = null;
  private touchSelection: {
    pointerId: number;
    square: Key;
    x: number;
    y: number;
  } | null = null;

  ngAfterViewInit(): void {
    this.ground = Chessground(this.boardEl.nativeElement, {
      fen: this.fen,
      orientation: this.orientation,
      viewOnly: true,
      coordinates: true,
      drawable: { enabled: false },
      highlight: {
        lastMove: false,
        custom: this.activeSquareClasses(),
      },
      movable: { free: false },
      draggable: { enabled: false },
      animation: { enabled: true, duration: 160 },
    });
    this.makePiecesFocusable();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fen'] && this.ground) {
      this.ground.set({ fen: this.fen });
      this.makePiecesFocusable();
    }
    if (changes['orientation'] && this.ground) {
      this.ground.set({ orientation: this.orientation });
      this.makePiecesFocusable();
    }
    if (changes['activeSquare'] && this.ground) {
      this.ground.set({
        highlight: { custom: this.activeSquareClasses() },
      });
    }
  }

  ngOnDestroy(): void {
    this.ground?.destroy();
    this.ground = null;
  }

  inspectPointerTarget(event: PointerEvent): void {
    // A finger moving during a tap or scroll is not a hover. Treating it as
    // one leaves stale inspection state that can override the tapped piece.
    if (event.pointerType === 'touch') return;
    const square = this.pieceSquare(event.target);
    this.pieceHovered.emit(square);
  }

  beginTouchSelection(event: PointerEvent): void {
    if (event.pointerType !== 'touch') return;
    const square = this.pieceSquare(event.target);
    this.touchSelection = square
      ? {
          pointerId: event.pointerId,
          square,
          x: event.clientX,
          y: event.clientY,
        }
      : null;
  }

  finishTouchSelection(event: PointerEvent): void {
    const candidate = this.touchSelection;
    this.touchSelection = null;
    if (
      event.pointerType !== 'touch' ||
      !candidate ||
      candidate.pointerId !== event.pointerId
    ) {
      return;
    }
    const movement = Math.hypot(
      event.clientX - candidate.x,
      event.clientY - candidate.y,
    );
    if (movement <= 10 && this.pieceSquare(event.target) === candidate.square) {
      this.pieceSelected.emit(candidate.square);
    }
  }

  cancelTouchSelection(): void {
    this.touchSelection = null;
  }

  selectPointerTarget(event: MouseEvent): void {
    const square = this.pieceSquare(event.target);
    if (square) this.pieceSelected.emit(square);
  }

  inspectFocusTarget(event: FocusEvent): void {
    const square = this.pieceSquare(event.target);
    if (square) this.pieceHovered.emit(square);
  }

  selectFocusedPiece(event: KeyboardEvent): void {
    if (!['Enter', ' '].includes(event.key)) return;
    const square = this.pieceSquare(event.target);
    if (!square) return;
    event.preventDefault();
    this.pieceSelected.emit(square);
  }

  private pieceSquare(target: EventTarget | null): Key | null {
    if (!(target instanceof Element)) return null;
    const piece = target.closest('piece') as KeyedNode | null;
    return piece?.cgKey ?? null;
  }

  private makePiecesFocusable(): void {
    requestAnimationFrame(() => {
      for (const piece of this.boardEl.nativeElement.querySelectorAll(
        'piece',
      )) {
        const keyedPiece = piece as KeyedNode;
        keyedPiece.tabIndex = 0;
        keyedPiece.setAttribute('role', 'button');
        keyedPiece.setAttribute(
          'aria-label',
          `Inspect character on ${keyedPiece.cgKey}`,
        );
      }
    });
  }

  private activeSquareClasses(): Map<Key, string> {
    return /^[a-h][1-8]$/.test(this.activeSquare ?? '')
      ? new Map([[this.activeSquare as Key, 'beat-active']])
      : new Map();
  }
}
