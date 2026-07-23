import { Routes } from '@angular/router';
import { PgnViewerComponent } from './pgn-viewer/pgn-viewer.component';

export const routes: Routes = [
  { path: '', component: PgnViewerComponent },
  { path: '**', redirectTo: '' },
];
