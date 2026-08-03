import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PgnApiService } from '../pgn-viewer/pgn-api.service';
import { HallOfRecordsComponent } from './hall-of-records.component';

describe('HallOfRecordsComponent', () => {
  let fixture: ComponentFixture<HallOfRecordsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HallOfRecordsComponent],
      providers: [
        provideRouter([]),
        {
          provide: PgnApiService,
          useValue: {
            getRecords: () =>
              of([
                {
                  id: 'record-1',
                  title: 'The Spear That Broke a Crown',
                  whitePlayer: 'Ada',
                  blackPlayer: 'Turing',
                  createdAt: '2026-07-01T00:00:00.000Z',
                  updatedAt: '2026-07-01T00:00:00.000Z',
                  completedAt: '2026-07-02T00:00:00.000Z',
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HallOfRecordsComponent);
    fixture.detectChanges();
  });

  it('lists completed sagas with replay links', () => {
    expect(fixture.nativeElement.textContent).toContain(
      'The Spear That Broke a Crown',
    );
    expect(fixture.nativeElement.textContent).toContain('Ada vs Turing');
    expect(fixture.nativeElement.textContent).not.toContain('victory');
    expect(
      fixture.nativeElement
        .querySelector('a[href="/records/record-1"]')
        .textContent.trim(),
    ).toBe('Replay saga →');
  });
});
