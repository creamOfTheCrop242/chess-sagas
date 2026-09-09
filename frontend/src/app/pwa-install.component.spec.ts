import { PwaInstallComponent, isInstalledApp } from './pwa-install.component';

describe('PWA install welcome', () => {
  const match = (mode = '') =>
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === `(display-mode: ${mode})`,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  const create = () => {
    const component = new PwaInstallComponent();
    const dialog = {
      open: false,
      showModal: vi.fn(() => {
        dialog.open = true;
      }),
      close: vi.fn(() => {
        dialog.open = false;
      }),
    };
    component.dialog = { nativeElement: dialog } as never;
    component.ngAfterViewInit();
    return { component, dialog };
  };
  beforeEach(() => {
    match();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('shows on each fresh browser visit regardless of prior dismissal', () => {
    const first = create();
    expect(first.dialog.showModal).toHaveBeenCalledTimes(1);
    first.component.dismiss();
    first.component.ngOnDestroy();
    const second = create();
    expect(second.dialog.showModal).toHaveBeenCalledTimes(1);
    second.component.ngOnDestroy();
  });
  it.each(['standalone', 'minimal-ui', 'fullscreen'])(
    'never opens in %s display mode',
    (mode) => {
      match(mode);
      const { component, dialog } = create();
      expect(isInstalledApp()).toBe(true);
      expect(dialog.showModal).not.toHaveBeenCalled();
      component.ngOnDestroy();
    },
  );
  it('recognizes iOS standalone mode', () => {
    vi.stubGlobal('navigator', {
      standalone: true,
      userAgent: 'iPhone',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });
    const { component, dialog } = create();
    expect(component.ios).toBe(true);
    expect(dialog.showModal).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
  it('recognizes iPad desktop user agents', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Macintosh',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    const { component } = create();
    expect(component.ios).toBe(true);
    component.ngOnDestroy();
  });
  it('only triggers native installation after a user action and consumes the event', async () => {
    const { component, dialog } = create();
    const event = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      { prompt: vi.fn().mockResolvedValue({ outcome: 'accepted' }) },
    );
    component.onInstallPrompt(event);
    expect(event.defaultPrevented).toBe(true);
    expect(event.prompt).not.toHaveBeenCalled();
    await component.install();
    await component.install();
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(false);
    component.showForVisit();
    expect(dialog.open).toBe(false);
    component.ngOnDestroy();
  });
  it('handles denied or unavailable installation without blocking browser use', async () => {
    const { component, dialog } = create();
    component.onInstallPrompt(
      Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockRejectedValue(new Error('denied')),
      }),
    );
    await component.install();
    expect(component.message()).toContain('continue in your browser');
    component.dismiss();
    expect(dialog.open).toBe(false);
    component.ngOnDestroy();
  });
});
