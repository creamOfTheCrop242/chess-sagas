import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PieceLoreComponent } from './piece-lore.component';

describe('PieceLoreComponent', () => {
  let fixture: ComponentFixture<PieceLoreComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PieceLoreComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PieceLoreComponent);
    fixture.detectChanges();
  });

  it('documents all six battlefield archetypes', () => {
    const cards = fixture.nativeElement.querySelectorAll('.lore-card');
    expect(cards).toHaveSize(6);
    expect(fixture.nativeElement.textContent).toContain('Moving Fortress');
    expect(fixture.nativeElement.textContent).toContain('Archwizard');
    expect(fixture.nativeElement.textContent).toContain('Soldier Company');
  });

  it('explains that teleportation is not the extent of Archwizard magic', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'Teleportation is their movement discipline—not the limit of their magic.',
    );
  });

  it('documents the Moving Fortress pilot origin and life support', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'wounded beyond the reach of healing',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'cannot survive outside the machine',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'devastating magic rounds',
    );
  });

  it('documents the Queen training, augmentation, and armor', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'Raised from birth to become the kingdom’s most complete champion',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Archwizard augmentation transformed her body beyond mortal limits',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'the same nearly indestructible material as a Moving Fortress',
    );
  });
});
