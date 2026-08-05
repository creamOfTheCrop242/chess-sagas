import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { KeyedNode } from 'chessground/types';
import { ChessboardComponent } from './chessboard.component';

describe('ChessboardComponent character interaction', () => {
  let fixture: ComponentFixture<ChessboardComponent>;
  let component: ChessboardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChessboardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChessboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('makes pieces interactive and emits their square on hover and click', () => {
    const piece = fixture.nativeElement.querySelector('piece') as KeyedNode;
    const hovered: Array<string | null> = [];
    const selected: string[] = [];
    component.pieceHovered.subscribe((square) => hovered.push(square));
    component.pieceSelected.subscribe((square) => selected.push(square));

    expect(getComputedStyle(piece).pointerEvents).toBe('auto');

    piece.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    piece.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(hovered).toEqual([piece.cgKey]);
    expect(selected).toEqual([piece.cgKey]);
  });

  it('clears the hovered piece when the pointer moves onto an empty square', () => {
    const piece = fixture.nativeElement.querySelector('piece') as KeyedNode;
    const board = fixture.nativeElement.querySelector('.board') as HTMLElement;
    const hovered: Array<string | null> = [];
    component.pieceHovered.subscribe((square) => hovered.push(square));

    piece.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    board.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));

    expect(hovered).toEqual([piece.cgKey, null]);
  });

  it('does not turn touch movement into hover state', () => {
    const piece = fixture.nativeElement.querySelector('piece') as KeyedNode;
    const hovered: Array<string | null> = [];
    component.pieceHovered.subscribe((square) => hovered.push(square));

    piece.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerType: 'touch',
      }),
    );

    expect(hovered).toEqual([]);
  });

  it('selects a piece directly from a mobile tap', () => {
    const piece = fixture.nativeElement.querySelector('piece') as KeyedNode;
    const selected: string[] = [];
    component.pieceSelected.subscribe((square) => selected.push(square));

    piece.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 40,
        clientY: 60,
      }),
    );
    piece.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 7,
        pointerType: 'touch',
        clientX: 42,
        clientY: 61,
      }),
    );

    expect(selected).toEqual([piece.cgKey]);
  });

  it('does not select a piece when the touch gesture is a scroll', () => {
    const piece = fixture.nativeElement.querySelector('piece') as KeyedNode;
    const selected: string[] = [];
    component.pieceSelected.subscribe((square) => selected.push(square));

    piece.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 8,
        pointerType: 'touch',
        clientX: 40,
        clientY: 60,
      }),
    );
    piece.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 8,
        pointerType: 'touch',
        clientX: 40,
        clientY: 100,
      }),
    );

    expect(selected).toEqual([]);
  });
});
