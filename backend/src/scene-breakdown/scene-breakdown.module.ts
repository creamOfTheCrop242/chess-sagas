import { Module } from '@nestjs/common';
import { SceneBreakdownController } from './scene-breakdown.controller';
import { SceneBreakdownService } from './scene-breakdown.service';
import { SceneBreakdownValidator } from './scene-breakdown.validator';
@Module({
  controllers: [SceneBreakdownController],
  providers: [SceneBreakdownService, SceneBreakdownValidator],
  exports: [SceneBreakdownService],
})
export class SceneBreakdownModule {}
