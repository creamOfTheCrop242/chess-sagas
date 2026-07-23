import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type {
  NarrativeAnalysisProvider,
  NarrativeAnalysisRequest,
} from './llm-provider';
import {
  narrativeAnalysisSchema,
  type NarrativeAnalysis,
} from './models/narrative-analysis';
import { NARRATIVE_ANALYSIS_INSTRUCTIONS } from './narrative-analysis.prompt';

@Injectable()
export class OpenAiNarrativeAnalysisProvider implements NarrativeAnalysisProvider {
  readonly model: string;
  private readonly client: OpenAI | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model =
      config.get<string>('NARRATIVE_ANALYSIS_MODEL') || 'gpt-5.6-sol';
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async analyze({
    ledger,
  }: NarrativeAnalysisRequest): Promise<NarrativeAnalysis> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    try {
      const response = await this.client.responses.parse({
        model: this.model,
        reasoning: { effort: 'medium' },
        instructions: NARRATIVE_ANALYSIS_INSTRUCTIONS,
        input: JSON.stringify({ completeLedger: ledger }),
        text: {
          format: zodTextFormat(narrativeAnalysisSchema, 'narrative_analysis'),
        },
      });

      if (!response.output_parsed) {
        throw new BadGatewayException('OpenAI returned no narrative analysis');
      }

      return narrativeAnalysisSchema.parse(response.output_parsed);
    } catch (error) {
      if (
        error instanceof ServiceUnavailableException ||
        error instanceof BadGatewayException
      ) {
        throw error;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'OpenAI narrative analysis failed';
      throw new BadGatewayException(message);
    }
  }
}
