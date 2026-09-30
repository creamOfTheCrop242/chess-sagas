import { ConfigService } from '@nestjs/config';
import { OpenAiFullStoryProvider } from './openai-full-story.provider';
import type { OpenAiTelemetryService } from '../openai/openai-telemetry.service';

jest.mock('../openai/openai-generation', () => ({
  ...jest.requireActual('../openai/openai-generation'),
  logOpenAiGeneration: jest.fn(),
  logOpenAiGenerationFailure: jest.fn(),
}));

describe('repair-only semantic verification', () => {
  function fixture() {
    const provider = new OpenAiFullStoryProvider(
      new ConfigService({}),
      {} as OpenAiTelemetryService,
    );
    const parse = jest.fn();
    Object.defineProperty(provider, 'client', {
      value: { responses: { parse } },
    });
    return { provider, parse };
  }
  const obligation = {
    id: '39:check',
    ply: 39,
    requirement: 'Bram must receive new check strain',
  };
  const scene = {
    ply: 39,
    fantasyNarration: 'Kerra fired. Bram was not mentioned again.',
  };
  const telemetry = {
    gameId: 'test',
    generationRunId: 'test-run',
    attempt: 1,
    repairMode: 'partial' as const,
  };
  it('adds no API call for scenes without applicable obligations', async () => {
    const { provider, parse } = fixture();
    expect(
      await provider['verifyRepairObligations']([], [scene], telemetry),
    ).toEqual([]);
    expect(parse).not.toHaveBeenCalled();
  });
  it('checks replacement prose and exposes a missing check to the retry caller', async () => {
    const { provider, parse } = fixture();
    parse.mockResolvedValue({
      output_parsed: {
        assessments: [
          {
            obligationId: '39:check',
            status: 'omitted',
            confidence: 'high',
            excerpt: 'Kerra fired.',
            reason: 'No new strain to Bram is depicted',
          },
        ],
      },
    });
    const findings = await provider['verifyRepairObligations'](
      [obligation],
      [scene],
      telemetry,
    );
    expect(findings[0]).toMatchObject({ ply: 39, severity: 'error' });
    expect(JSON.parse(parse.mock.calls[0][0].input)).toEqual({
      obligations: [obligation],
      scenes: [scene],
    });
    expect(parse).toHaveBeenCalledTimes(1);
  });
  it('does not silently accept a failed or incomplete verifier', async () => {
    const { provider, parse } = fixture();
    parse.mockResolvedValue({ output_parsed: { assessments: [] } });
    await expect(
      provider['verifyRepairObligations']([obligation], [scene], telemetry),
    ).rejects.toThrow('Incomplete');
  });
  it('uses the shared factual review schema for original and replacement prose', async () => {
    const { provider, parse } = fixture();
    parse.mockResolvedValue({ output_parsed: { assessments: [] } });
    await provider.reviewSceneFacts({
      contracts: [],
      scenes: [],
      contextScenes: [],
      telemetry,
    });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(parse.mock.calls[0][0].instructions).toContain('expected facts');
    expect(parse.mock.calls[0][0].text.format.name).toBe('scene_fact_review');
  });
  it('does not perform a second hidden review when the coordinator manages validation', async () => {
    const { provider, parse } = fixture();
    parse.mockResolvedValue({ output_parsed: { scenes: [scene] } });
    const request = {
      validationManagedByCaller: true,
      sceneObligations: [obligation],
      scenes: [scene],
      telemetry,
    } as unknown as Parameters<typeof provider.repairStoryScenes>[0];
    const result = await provider.repairStoryScenes(request);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(result.obligationFindings).toEqual([]);
  });
});
