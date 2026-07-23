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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    GamesModule,
    PgnModule,
    StoryModule,
    NarrativeAnalysisModule,
    StoryOutlineModule,
    FullStoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
