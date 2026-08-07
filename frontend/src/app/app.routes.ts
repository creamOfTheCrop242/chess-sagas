import { Routes } from '@angular/router';
import { CalamityLoreComponent } from './calamity-lore/calamity-lore.component';
import { HallOfRecordsComponent } from './hall-of-records/hall-of-records.component';
import { PieceLoreComponent } from './piece-lore/piece-lore.component';
import { PgnViewerComponent } from './pgn-viewer/pgn-viewer.component';
import { SagaGuideComponent } from './saga-guide/saga-guide.component';
import { LoginComponent } from './login/login.component';
import { PricingComponent } from './pricing/pricing.component';

export const routes: Routes = [
  { path: '', component: PgnViewerComponent },
  { path: 'lore', component: PieceLoreComponent },
  { path: 'lore/calamity', component: CalamityLoreComponent },
  { path: 'records', component: HallOfRecordsComponent },
  { path: 'records/:id', component: PgnViewerComponent },
  { path: 'guide', component: SagaGuideComponent },
  { path: 'login', component: LoginComponent },
  { path: 'pricing', component: PricingComponent },
  { path: '**', redirectTo: '' },
];
