import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArchiveRecordSummary } from '../pgn-viewer/pgn.models';
import { PgnApiService } from '../pgn-viewer/pgn-api.service';

@Component({
  selector: 'app-hall-of-records',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './hall-of-records.component.html',
  styleUrl: './hall-of-records.component.css',
})
export class HallOfRecordsComponent implements OnInit {
  records: ArchiveRecordSummary[] = [];
  loading = true;
  error: string | null = null;

  constructor(private readonly api: PgnApiService) {}

  ngOnInit(): void {
    this.api.getRecords().subscribe({
      next: (records) => {
        this.records = records;
        this.loading = false;
      },
      error: () => {
        this.error = 'The records could not be opened.';
        this.loading = false;
      },
    });
  }

}
