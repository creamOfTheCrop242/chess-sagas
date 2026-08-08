import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { CommunityService } from '../community/community.service';
import { HallOfRecordsComponent } from './hall-of-records.component';

describe('HallOfRecordsComponent', () => {
  let fixture: ComponentFixture<HallOfRecordsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HallOfRecordsComponent],
      providers: [
        provideRouter([]),
        {
          provide: CommunityService,
          useValue: {
            list: () =>
              of({ items: [
                {
                  id: 'record-1',
                  title: 'The Spear That Broke a Crown',
                  whitePlayer: 'Ada',
                  blackPlayer: 'Turing',
                  createdAt: '2026-07-01T00:00:00.000Z',
                  updatedAt: '2026-07-01T00:00:00.000Z',
                  completedAt: '2026-07-02T00:00:00.000Z',
                  gameId: 'game-1',
                  result: '1-0',
                  visibility: 'PUBLIC',
                  storyVersion: 'v1',
                  creator: null,
                },
              ], nextCursor: null }),
          },
        },
        {
          provide: AuthService,
          useValue: { user: signal(null), loading: signal(false) },
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
