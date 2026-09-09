import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { renderSagaShare, SagaShareSnapshot } from './saga-share';

@Component({
  selector: 'app-saga-share',
  standalone: true,
  template: `
    <button type="button" [disabled]="!snapshot" (click)="prepare($event)">
      Share this beat
    </button>
    <dialog #dialog (click)="backdrop($event)" (close)="reset()">
      <header>
        <h2>Share this moment</h2>
        <button type="button" aria-label="Close sharing" (click)="close()">
          ×
        </button>
      </header>
      @if (busy) {
        <p role="status">Preparing your image…</p>
      }
      @if (imageUrl) {
        <img
          [src]="imageUrl"
          alt="Share card showing the current board, selected character, and story text"
        />
      }
      <p role="status">{{ message }}</p>
      <div class="actions">
        @if (file && canShareImage) {
          <button type="button" (click)="share()">Share image + link</button>
        }
        @if (imageUrl) {
          <a [href]="imageUrl" download="chess-sagas-beat.png"
            >Download image</a
          >
        }
        <button type="button" (click)="copyLink()">Copy replay link</button>
      </div>
      <p class="hint">
        The link opens this beat and character. Some apps accept only the
        image—copy the replay link separately if needed.
      </p>
      @if (copyFallback) {
        <input
          aria-label="Replay link to copy"
          readonly
          [value]="shared?.url ?? ''"
          (focus)="selectLink($event)"
        />
      }
    </dialog>
  `,
  styles: [
    `
      :host {
        display: block;
        margin: 0.6rem 0;
      }
      button,
      a {
        font: inherit;
        color: #ead396;
        background: #15202b;
        border: 1px solid #877447;
        padding: 0.65rem 1rem;
        cursor: pointer;
        text-decoration: none;
        display: inline-block;
      }
      button:disabled {
        opacity: 0.5;
        cursor: default;
      }
      dialog {
        position: fixed;
        inset: 0;
        margin: auto;
        width: min(620px, 90vw);
        max-height: 85dvh;
        overflow: auto;
        background: #0b1520;
        color: #e8e4d8;
        border: 1px solid #877447;
        padding: 1rem;
        box-sizing: border-box;
      }
      dialog::backdrop {
        background: #000b;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      h2 {
        font-size: 1.2rem;
      }
      img {
        width: 100%;
        height: auto;
        display: block;
      }
      .actions {
        display: flex;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .hint {
        font-size: 0.85rem;
        color: #abb4bd;
      }
      input {
        width: 100%;
        box-sizing: border-box;
      }
      button:focus-visible,
      a:focus-visible {
        outline: 2px solid #79c9c0;
        outline-offset: 3px;
      }
    `,
  ],
})
export class SagaShareComponent implements OnDestroy {
  @Input() snapshot: SagaShareSnapshot | null = null;
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  imageUrl: string | null = null;
  file: File | null = null;
  shared: SagaShareSnapshot | null = null;
  busy = false;
  message = '';
  copyFallback = false;
  private request = 0;
  get canShareImage(): boolean {
    return (
      !!this.file &&
      !!navigator.share &&
      !!navigator.canShare?.({ files: [this.file] })
    );
  }
  async prepare(event: Event): Promise<void> {
    event.stopPropagation();
    if (!this.snapshot) return;
    this.reset();
    const request = ++this.request;
    this.shared = structuredClone(this.snapshot);
    this.busy = true;
    this.dialog.nativeElement.showModal();
    try {
      const blob = await renderSagaShare(this.shared);
      if (request !== this.request) return;
      this.file = new File([blob], 'chess-sagas-beat.png', {
        type: 'image/png',
      });
      this.imageUrl = URL.createObjectURL(blob);
    } catch (error) {
      if (request === this.request)
        this.message =
          error instanceof Error
            ? error.message
            : 'Could not prepare image. You can still copy the replay link.';
    } finally {
      if (request === this.request) this.busy = false;
    }
  }
  async share(): Promise<void> {
    if (!this.file || !this.shared) return;
    try {
      await navigator.share({
        files: [this.file],
        title: this.shared.title,
        text: `${this.shared.page} — Chess Sagas`,
        url: this.shared.url,
      });
      this.message = 'Shared.';
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError')
        this.message =
          'Sharing was unavailable. Download the image and copy the replay link instead.';
    }
  }
  async copyLink(): Promise<void> {
    if (!this.shared) return;
    try {
      await navigator.clipboard.writeText(this.shared.url);
      this.message = 'Replay link copied.';
    } catch {
      this.copyFallback = true;
      this.message = 'Select and copy the replay link below.';
    }
  }
  selectLink(event: Event): void {
    (event.target as HTMLInputElement).select();
  }
  backdrop(event: MouseEvent): void {
    if (event.target !== this.dialog.nativeElement) return;
    const r = this.dialog.nativeElement.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      this.close();
  }
  close(): void {
    this.dialog.nativeElement.close();
    this.reset();
  }
  reset(): void {
    this.request++;
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
    this.imageUrl = null;
    this.file = null;
    this.shared = null;
    this.busy = false;
    this.message = '';
    this.copyFallback = false;
  }
  ngOnDestroy(): void {
    this.reset();
  }
}
