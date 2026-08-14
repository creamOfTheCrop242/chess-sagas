import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HallOfChampionsComponent } from './hall-of-champions.component';

describe('HallOfChampionsComponent', () => {
  it('renders ranked character performances and links to their saga', async () => {
    await TestBed.configureTestingModule({
      imports: [HallOfChampionsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(HallOfChampionsComponent);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http.expectOne('/api/sagas/champions?limit=100').flush([
      {
        id: 'saga-1:w-p-a2',
        rank: 1,
        sagaId: 'saga-1',
        gameId: 'game-1',
        pieceId: 'w-p-a2',
        name: 'Elara',
        role: 'archer',
        fantasyType: 'grunt',
        side: 'north',
        kills: 4,
        lastKillPly: 31,
        status: 'Alive',
        killedBy: null,
        backstory: 'Elara guarded the frostward roads.',
        battleTitle: 'The Battle Under Ember Rain',
        battlefield: 'Frostward Road',
        whitePlayer: 'Ada',
        blackPlayer: 'Turing',
        completedAt: '2026-08-13T00:00:00.000Z',
      },
    ]);
    http.expectOne('/api/sagas/champions/stats').flush({
      totalBattles: 8,
      lightVictories: 3,
      darkVictories: 4,
      draws: 1,
      unfinished: 0,
      lightCaptures: 31,
      darkCaptures: 34,
      totalCaptures: 65,
      averageCapturesPerBattle: 8.1,
      lightMostLethalType: { fantasyType: 'queen', captures: 9 },
      darkMostLethalType: { fantasyType: 'moving-fortress', captures: 11 },
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Elara');
    expect(fixture.nativeElement.textContent).toContain('31');
    expect(fixture.nativeElement.textContent).toContain('Dark victories');
    expect(fixture.nativeElement.textContent).toContain('4');
    fixture.nativeElement.querySelector('.champion-summary').click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/records/saga-1"]'),
    ).not.toBeNull();
    http.verify();
  });
});
