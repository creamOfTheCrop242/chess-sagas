import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PgnModule } from './pgn/pgn.module';
import { StoryModule } from './story/story.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PgnModule,
    StoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
