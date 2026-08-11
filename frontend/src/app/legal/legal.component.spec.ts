import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LegalComponent } from './legal.component';

describe('LegalComponent', () => {
  async function render(legalPage: 'terms' | 'privacy' | 'refunds') {
    await TestBed.configureTestingModule({
      imports: [LegalComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { legalPage } } } },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<LegalComponent> = TestBed.createComponent(LegalComponent);
    fixture.detectChanges();
    return fixture.nativeElement.textContent as string;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('discloses AI generation and public visibility in the terms', async () => {
    const text = await render('terms');
    expect(text).toContain('uses artificial intelligence');
    expect(text).toContain('publicly visible by default');
    expect(text).toContain('Automatic generation, correction, and validation retries');
    expect(text).toContain('Credits currently do not expire');
  });

  it('provides account and data-deletion instructions', async () => {
    const text = await render('privacy');
    expect(text).toContain('Delete my account and data');
    expect(text).toContain('don@creamofthecrop.tech');
    expect(text).toContain('Public saga records may need separate review');
  });

  it('explains refunds, cancellation, failures, and rollover', async () => {
    const text = await render('refunds');
    expect(text).toContain('within 14 days');
    expect(text).toContain('terminal failure');
    expect(text).toContain('roll over');
    expect(text).toContain('end of the current paid billing period');
  });
});
