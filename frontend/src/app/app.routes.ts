import { Routes } from '@angular/router';
import { CalamityLoreComponent } from './calamity-lore/calamity-lore.component';
import { PieceLoreComponent } from './piece-lore/piece-lore.component';
import { PgnViewerComponent } from './pgn-viewer/pgn-viewer.component';
import { SagaGuideComponent } from './saga-guide/saga-guide.component';
import { LoginComponent } from './login/login.component';
import { PricingComponent } from './pricing/pricing.component';

export const routes: Routes = [
  { path: '', component: PgnViewerComponent },
  { path: 'lore', component: PieceLoreComponent },
  { path: 'lore/calamity', component: CalamityLoreComponent },
  {
    path: 'records',
    loadComponent: () =>
      import('./hall-of-records/hall-of-records.component').then(
        (module) => module.HallOfRecordsComponent,
      ),
  },
  { path: 'records/:id', component: PgnViewerComponent },
  {
    path: 'chroniclers/:handle',
    loadComponent: () =>
      import('./community/creator-profile.component').then(
        (module) => module.CreatorProfileComponent,
      ),
  },
  {
    path: 'profile',
    loadComponent: () =>
      import('./community/my-profile.component').then(
        (module) => module.MyProfileComponent,
      ),
  },
  { path: 'guide', component: SagaGuideComponent },
  { path: 'login', component: LoginComponent },
  { path: 'pricing', component: PricingComponent },
  {
    path: 'admin/reports',
    loadComponent: () =>
      import('./reporting/reporting.component').then(
        (module) => module.ReportingComponent,
      ),
  },
  { path: '**', redirectTo: '' },
];
