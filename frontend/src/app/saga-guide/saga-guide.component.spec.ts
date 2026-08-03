import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SagaGuideComponent } from './saga-guide.component';

describe('SagaGuideComponent', () => {
  let fixture: ComponentFixture<SagaGuideComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SagaGuideComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(SagaGuideComponent);
    fixture.detectChanges();
  });

  it('explains the complete saga experience', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Named characters and companies');
    expect(text).toContain('Relationships and character arcs');
    expect(text).toContain('Captures, wounds, and recovery');
    expect(text).toContain('Aftermath and later chronicles');
    expect(text).toContain('Hall of Records');
  });

  it('sets accurate expectations for probabilistic wounds', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('higher seeded chance');
    expect(text).toContain('There is no guaranteed minimum');
    expect(text).toContain('accumulate several');
  });

  it('includes a clear content notice', () => {
    expect(
      fixture.nativeElement.querySelector('.content-note').textContent,
    ).toContain('battlefield violence');
  });
});
