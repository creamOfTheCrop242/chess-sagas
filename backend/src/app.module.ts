import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PgnModule } from './pgn/pgn.module';
import { StoryModule } from './story/story.module';
import { DatabaseModule } from './database/database.module';
import { GamesModule } from './games/games.module';
import { NarrativeAnalysisModule } from './narrative-analysis/narrative-analysis.module';
import { StoryOutlineModule } from './story-outline/story-outline.module';
import { FullStoryModule } from './full-story/full-story.module';
import { StoryValidationModule } from './story-validation/story-validation.module';
import { SceneBreakdownModule } from './scene-breakdown/scene-breakdown.module';
import { GenerationModule } from './generation/generation.module';
import { SagaGenerationModule } from './generation/saga-generation.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CommunityModule } from './community/community.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    GenerationModule,
    GamesModule,
    PgnModule,
    StoryModule,
    NarrativeAnalysisModule,
    StoryOutlineModule,
    FullStoryModule,
    StoryValidationModule,
    SceneBreakdownModule,
    SagaGenerationModule,
    AuthModule,
    BillingModule,
    CommunityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
