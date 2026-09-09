import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  signal,
} from '@angular/core';

interface InstallPrompt extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isInstalledApp(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    ['standalone', 'minimal-ui', 'fullscreen'].some(
      (mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches,
    )
  );
}

@Component({
  selector: 'app-pwa-install',
  standalone: true,
  template: `
    <dialog
      #dialog
      aria-labelledby="install-title"
      aria-describedby="install-intro"
      (click)="backdrop($event)"
    >
      <header>
        <img src="/icons/icon-96x96.png" alt="" width="64" height="64" /><button
          type="button"
          aria-label="Close installation instructions"
          (click)="dismiss()"
        >
          ×
        </button>
      </header>
      <h2 id="install-title">Keep Chess Sagas on your home screen</h2>
      <p id="install-intro">
        Install the free web app for a more convenient way to read and create
        your sagas.
      </p>
      <ul>
        <li>
          Open Chess Sagas directly from its own icon—no searching through
          browser tabs.
        </li>
        <li>Read with more screen space in a dedicated app window.</li>
        <li>
          Get saga completion and failure notifications on supported devices
          when you allow notifications.
        </li>
      </ul>
      <p>
        Installation is free. Saga credits and subscriptions are unchanged, and
        generating or loading sagas still needs an internet connection.
      </p>
      <h3>How to install</h3>
      @if (ios) {
        <ol>
          <li>Open this site in Safari.</li>
          <li>
            Tap <strong>Share</strong> (the square with an upward arrow). If
            needed, open the browser menu to find Share.
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>. Scroll down in the share
            menu if you do not see it.
          </li>
          <li>
            Keep <strong>Open as Web App</strong> enabled if offered, then tap
            <strong>Add</strong>.
          </li>
        </ol>
      } @else if (android) {
        <ol>
          <li>
            Open this site in Chrome or another browser that supports installing
            web apps.
          </li>
          <li>
            Tap <strong>Install Chess Sagas</strong> below when available, or
            open the browser menu and choose <strong>Install app</strong> or
            <strong>Add to Home screen</strong>.
          </li>
          <li>Confirm installation, then open Chess Sagas from its icon.</li>
        </ol>
      } @else {
        <p>
          In Chrome or Edge, use the install icon in the address bar or the
          browser menu’s <strong>Install app</strong> option. On a supported
          Mac, Safari offers <strong>File → Add to Dock</strong>. If your
          browser does not offer installation, try Chrome or Edge.
        </p>
      }
      <p>
        Already installed? Open Chess Sagas from its app icon instead of this
        browser tab.
      </p>
      <p role="status">{{ message() }}</p>
      <footer>
        @if (installEvent()) {
          <button type="button" [disabled]="installing()" (click)="install()">
            Install Chess Sagas
          </button>
        }
        <button type="button" (click)="dismiss()">Continue in browser</button>
      </footer>
    </dialog>
  `,
  styles: [
    `
      dialog {
        position: fixed;
        inset: 0;
        margin: auto;
        width: min(560px, 92vw);
        max-height: 88dvh;
        overflow: auto;
        box-sizing: border-box;
        padding: 1.4rem;
        background: #0b1520;
        color: #e8e4d8;
        border: 1px solid #b59b60;
        border-radius: 12px;
        font:
          1rem/1.5 Georgia,
          serif;
        box-shadow: 0 16px 70px #0008;
      }
      dialog::backdrop {
        background: #000b;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      header img {
        border-radius: 12px;
      }
      h2,
      h3 {
        color: #ead396;
        line-height: 1.2;
      }
      h2 {
        font-size: 1.65rem;
      }
      h3 {
        font-size: 1.15rem;
      }
      li {
        margin: 0.55rem 0;
      }
      ul,
      ol {
        padding-left: 1.3rem;
      }
      button {
        font: inherit;
        color: #ead396;
        background: #182631;
        border: 1px solid #877447;
        border-radius: 4px;
        padding: 0.65rem 0.8rem;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid #79c9c0;
        outline-offset: 3px;
      }
      button:disabled {
        opacity: 0.5;
      }
      footer {
        display: flex;
        gap: 0.65rem;
        flex-wrap: wrap;
        position: sticky;
        bottom: -1.4rem;
        background: #0b1520;
        padding: 0.8rem 0;
      }
      header button {
        font-size: 1.5rem;
        padding: 0.1rem 0.7rem;
      }
    `,
  ],
})
export class PwaInstallComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  readonly ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  readonly android = /Android/i.test(navigator.userAgent);
  readonly installEvent = signal<InstallPrompt | null>(null);
  readonly installing = signal(false);
  readonly message = signal('');
  private installedThisVisit = false;
  private displays: MediaQueryList[] = [];
  private readonly onDisplayChange = () => {
    if (isInstalledApp()) this.dismiss();
  };

  ngAfterViewInit(): void {
    this.displays = ['standalone', 'minimal-ui', 'fullscreen'].flatMap(
      (mode) =>
        window.matchMedia ? [window.matchMedia(`(display-mode: ${mode})`)] : [],
    );
    this.displays.forEach((display) =>
      display.addEventListener('change', this.onDisplayChange),
    );
    this.showForVisit();
  }
  // No persistent dismissal flag: every fresh browser visit gets instructions.
  showForVisit(): void {
    if (
      this.dialog &&
      !this.installedThisVisit &&
      !isInstalledApp() &&
      !this.dialog.nativeElement.open
    )
      this.dialog.nativeElement.showModal();
  }
  @HostListener('window:pageshow', ['$event'])
  onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) this.showForVisit();
  }
  @HostListener('window:beforeinstallprompt', ['$event'])
  onInstallPrompt(event: Event): void {
    event.preventDefault();
    if (!isInstalledApp() && !this.installedThisVisit)
      this.installEvent.set(event as InstallPrompt);
  }
  @HostListener('window:appinstalled')
  onInstalled(): void {
    this.installedThisVisit = true;
    this.installEvent.set(null);
    this.dismiss();
  }
  async install(): Promise<void> {
    const event = this.installEvent();
    if (!event || this.installing()) return;
    this.installEvent.set(null);
    this.installing.set(true);
    try {
      const result = await event.prompt();
      if (result.outcome === 'accepted') this.onInstalled();
      else this.message.set('You can install later using your browser menu.');
    } catch {
      this.message.set(
        'Use the browser instructions above to install, or continue in your browser.',
      );
    } finally {
      this.installing.set(false);
    }
  }
  dismiss(): void {
    this.dialog?.nativeElement.close();
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
      this.dismiss();
  }
  ngOnDestroy(): void {
    this.displays.forEach((display) =>
      display.removeEventListener('change', this.onDisplayChange),
    );
  }
}
