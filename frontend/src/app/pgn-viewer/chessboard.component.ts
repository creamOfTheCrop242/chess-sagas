import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';

@Component({
  selector: 'app-chessboard',
  standalone: true,
  template: `<div #board class="board"></div>`,
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
    `,
  ],
})
export class ChessboardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('board', { static: true }) boardEl!: ElementRef<HTMLDivElement>;

  @Input() fen =
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  private ground: Api | null = null;

  ngAfterViewInit(): void {
    this.ground = Chessground(this.boardEl.nativeElement, {
      fen: this.fen,
      viewOnly: true,
      coordinates: true,
      drawable: { enabled: false },
      movable: { free: false },
      draggable: { enabled: false },
      animation: { enabled: true, duration: 160 },
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['fen'] && this.ground) {
      this.ground.set({ fen: this.fen });
    }
  }

  ngOnDestroy(): void {
    this.ground?.destroy();
    this.ground = null;
  }
}
