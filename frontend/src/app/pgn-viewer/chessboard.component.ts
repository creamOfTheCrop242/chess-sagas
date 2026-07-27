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
    (pointermove)="inspectPointerTarget($event)"
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
  @Output() pieceHovered = new EventEmitter<string | null>();
  @Output() pieceSelected = new EventEmitter<string>();

  private ground: Api | null = null;

  ngAfterViewInit(): void {
    this.ground = Chessground(this.boardEl.nativeElement, {
      fen: this.fen,
      orientation: this.orientation,
      viewOnly: true,
      coordinates: true,
      drawable: { enabled: false },
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
  }

  ngOnDestroy(): void {
    this.ground?.destroy();
    this.ground = null;
  }

  inspectPointerTarget(event: PointerEvent): void {
    const square = this.pieceSquare(event.target);
    this.pieceHovered.emit(square);
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
}
