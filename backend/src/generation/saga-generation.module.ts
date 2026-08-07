import { Module } from '@nestjs/common';
import { FullStoryModule } from '../full-story/full-story.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { NarrativeAnalysisModule } from '../narrative-analysis/narrative-analysis.module';
import { SceneBreakdownModule } from '../scene-breakdown/scene-breakdown.module';
import { StoryOutlineModule } from '../story-outline/story-outline.module';
import { StoryValidationModule } from '../story-validation/story-validation.module';
import { SagaGenerationController } from './saga-generation.controller';
import { SagaGenerationService } from './saga-generation.service';
import { PushNotificationController } from './push-notification.controller';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    NarrativeAnalysisModule,
    StoryOutlineModule,
    FullStoryModule,
    StoryValidationModule,
    SceneBreakdownModule,
  ],
  controllers: [SagaGenerationController, PushNotificationController],
  providers: [SagaGenerationService, PushNotificationService],
})
export class SagaGenerationModule {}
