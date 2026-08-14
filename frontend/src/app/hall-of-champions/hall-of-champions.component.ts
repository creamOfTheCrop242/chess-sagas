import { DatePipe, TitleCasePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ChampionEntry, ChampionStats } from '../community/community.models';
import { CommunityService } from '../community/community.service';

@Component({
  selector: 'app-hall-of-champions',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, TitleCasePipe],
  templateUrl: './hall-of-champions.component.html',
  styleUrl: './hall-of-champions.component.css',
})
export class HallOfChampionsComponent implements OnInit {
  private readonly community = inject(CommunityService);

  champions: ChampionEntry[] = [];
  stats: ChampionStats | null = null;
  side = '';
  type = '';
  loading = true;
  error: string | null = null;
  selected: ChampionEntry | null = null;

  readonly types = [
    { value: '', label: 'All ranks' },
    { value: 'grunt', label: 'Pawn companies' },
    { value: 'knight-commander', label: 'Knight Commanders' },
    { value: 'archwizard', label: 'Archwizards' },
    { value: 'moving-fortress', label: 'Moving Fortresses' },
    { value: 'queen', label: 'Queens' },
    { value: 'king', label: 'Kings' },
  ];

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.selected = null;
    forkJoin({
      champions: this.community.champions({
        side:
          this.side === 'north' || this.side === 'south'
            ? this.side
            : undefined,
        type: this.type || undefined,
        limit: 100,
      }),
      stats: this.community.championStats(),
    }).subscribe({
      next: ({ champions, stats }) => {
        this.champions = champions;
        this.stats = stats;
        this.loading = false;
      },
      error: () => {
        this.error = 'The champion rolls could not be opened.';
        this.loading = false;
      },
    });
  }

  select(entry: ChampionEntry): void {
    this.selected = this.selected?.id === entry.id ? null : entry;
  }

  role(entry: ChampionEntry): string {
    return entry.role.replaceAll('-', ' ');
  }

  pieceGlyph(entry: ChampionEntry): string {
    const glyphs: Record<string, string> = {
      king: '♚',
      queen: '♛',
      'moving-fortress': '♜',
      archwizard: '♝',
      'knight-commander': '♞',
      grunt: '♟',
    };
    return glyphs[entry.fantasyType] ?? '♟';
  }

  statRole(type: string | undefined): string {
    return (type ?? 'No recorded champion').replaceAll('-', ' ');
  }

  resultShare(value: number): number {
    if (!this.stats?.totalBattles) return 0;
    return (value / this.stats.totalBattles) * 100;
  }
}
