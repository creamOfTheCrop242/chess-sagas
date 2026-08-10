import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import {
  createOpenAiGenerationClient,
  compactGameLedgerForModel,
  logOpenAiGeneration,
  logOpenAiGenerationFailure,
  promptCacheOptions,
} from '../openai/openai-generation';
import { OpenAiTelemetryService } from '../openai/openai-telemetry.service';
import type {
  NarrativeAnalysisProvider,
  NarrativeAnalysisRequest,
} from './llm-provider';
import {
  createLedgerConstrainedNarrativeAnalysisSchema,
  narrativeAnalysisSchema,
  type NarrativeAnalysis,
} from './models/narrative-analysis';
import { NARRATIVE_ANALYSIS_INSTRUCTIONS } from './narrative-analysis.prompt';

@Injectable()
export class OpenAiNarrativeAnalysisProvider implements NarrativeAnalysisProvider {
  readonly model: string;
  private readonly logger = new Logger(OpenAiNarrativeAnalysisProvider.name);
  private readonly client: OpenAI | null;

  constructor(
    config: ConfigService,
    private readonly telemetryRecorder: OpenAiTelemetryService,
  ) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.model =
      config.get<string>('NARRATIVE_ANALYSIS_MODEL') || 'gpt-5.6-luna';
    this.client = apiKey ? createOpenAiGenerationClient(apiKey, config) : null;
  }

  async analyze({
    ledger,
    requiredWoundEvents,
    battlefieldEnvironment,
    surrenderContext,
    endingContract,
    telemetry,
  }: NarrativeAnalysisRequest): Promise<NarrativeAnalysis> {
    if (!this.client) {
      throw new ServiceUnavailableException('OPENAI_API_KEY is not configured');
    }

    const startedAt = Date.now();
    const responseSchema = createLedgerConstrainedNarrativeAnalysisSchema(
      ledger.pieces.map((piece) => piece.id),
    );
    const input = JSON.stringify({
      completeLedger: compactGameLedgerForModel(ledger),
      requiredWoundEvents,
      battlefieldEnvironment,
      surrenderContext,
      endingContract,
    });
    const callTelemetry = {
      ...telemetry,
      payloadBytes: Buffer.byteLength(input, 'utf8'),
    };
    try {
      const response = await this.client.responses.parse({
        model: this.model,
        ...promptCacheOptions(this.model, 'chess-sagas:narrative-analysis'),
        reasoning: { effort: 'medium' },
        instructions: NARRATIVE_ANALYSIS_INSTRUCTIONS,
        input,
        text: {
          format: zodTextFormat(responseSchema, 'narrative_analysis'),
        },
      });
      if (!response.output_parsed) {
        throw new BadGatewayException('OpenAI returned no narrative analysis');
      }
      const analysis = narrativeAnalysisSchema.parse(response.output_parsed);
      logOpenAiGeneration(
        this.logger,
        'narrative-analysis',
        this.model,
        startedAt,
        response,
        callTelemetry,
        this.telemetryRecorder,
      );
      return analysis;
    } catch (error) {
      logOpenAiGenerationFailure(
        this.logger,
        'narrative-analysis',
        this.model,
        startedAt,
        error,
        callTelemetry,
        this.telemetryRecorder,
      );
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
