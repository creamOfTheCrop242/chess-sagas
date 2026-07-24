import { Module } from '@nestjs/common';
import { OpenAiSceneBreakdownProvider } from './openai-scene-breakdown.provider';
import { SceneBreakdownController } from './scene-breakdown.controller';
import { SCENE_BREAKDOWN_PROVIDER } from './scene-breakdown.provider';
import { SceneBreakdownService } from './scene-breakdown.service';
import { SceneBreakdownValidator } from './scene-breakdown.validator';
@Module({
  controllers: [SceneBreakdownController],
  providers: [
    SceneBreakdownService,
    SceneBreakdownValidator,
    {
      provide: SCENE_BREAKDOWN_PROVIDER,
      useClass: OpenAiSceneBreakdownProvider,
    },
  ],
})
export class SceneBreakdownModule {}
