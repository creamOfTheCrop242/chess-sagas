import {
  coordinateSceneRepairs,
  SceneValidationUnavailableError,
} from './scene-repair-coordinator';
import type { ValidationFinding } from '../story-validation/models/story-validation';

const finding = (
  type: ValidationFinding['type'],
  ply = 20,
): ValidationFinding => ({
  type,
  ply,
  pieceId: 'evander',
  severity: 'error',
  excerpt: 'bad',
  message: type,
});
describe('shared targeted repair coordinator', () => {
  const fixture = () => ({
    scenes: [
      { startPly: 20, fantasyNarration: 'initial' },
      { startPly: 21, fantasyNarration: 'untouched' },
    ],
    validate: jest.fn().mockResolvedValue([]),
    repair: jest.fn(),
    apply: (
      scene: { startPly: number; fantasyNarration: string },
      prose: string,
    ) => ({ ...scene, fantasyNarration: prose }),
    record: jest.fn().mockResolvedValue(undefined),
  });
  it('does not repair warnings', async () => {
    const f = fixture();
    f.validate.mockResolvedValue([
      { ...finding('invented-wound'), severity: 'warning' },
    ]);
    await coordinateSceneRepairs(f);
    expect(f.repair).not.toHaveBeenCalled();
  });
  it('rechecks all scenes and catches a wound introduced while repairing a weapon', async () => {
    const f = fixture();
    f.validate
      .mockResolvedValueOnce([finding('mythic-arm-ownership')])
      .mockResolvedValueOnce([finding('invented-wound')])
      .mockResolvedValueOnce([]);
    f.repair
      .mockResolvedValueOnce([{ ply: 20, fantasyNarration: 'wrong wound' }])
      .mockResolvedValueOnce([{ ply: 20, fantasyNarration: 'correct' }]);
    const result = await coordinateSceneRepairs(f);
    expect(f.validate).toHaveBeenCalledTimes(3);
    expect(f.validate.mock.calls.every(([scenes]) => scenes.length === 2)).toBe(
      true,
    );
    expect(result.scenes[1]).toEqual(f.scenes[1]);
    expect(result.scenes[0].fantasyNarration).toBe('correct');
    expect(f.scenes[0].fantasyNarration).toBe('initial');
  });
  it('never resets the budget when categories change and retains the rejected candidate', async () => {
    const f = fixture();
    f.validate
      .mockResolvedValueOnce([finding('invented-wound')])
      .mockResolvedValueOnce([finding('wrong-captor')])
      .mockResolvedValueOnce([finding('mythic-arm-ownership')]);
    f.repair.mockResolvedValue([{ ply: 20, fantasyNarration: 'still wrong' }]);
    await expect(coordinateSceneRepairs(f)).rejects.toThrow(
      'exhausted two rounds',
    );
    expect(f.repair).toHaveBeenCalledTimes(2);
    expect(f.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        round: 2,
        scenes: expect.arrayContaining([
          expect.objectContaining({ fantasyNarration: 'still wrong' }),
        ]),
      }),
    );
  });
  it.each([
    [],
    [{ ply: 21, fantasyNarration: 'out of scope' }],
    [
      { ply: 20, fantasyNarration: 'one' },
      { ply: 20, fantasyNarration: 'duplicate' },
    ],
  ])(
    'rejects incomplete, out-of-scope or duplicate patches',
    async (...args) => {
      const f = fixture();
      f.validate.mockResolvedValue([finding('invented-wound')]);
      // Jest spreads array table entries; rebuild the supplied patch array.
      f.repair.mockResolvedValue(args);
      await expect(coordinateSceneRepairs(f)).rejects.toThrow('coverage');
      expect(f.repair).toHaveBeenCalledTimes(2);
    },
  );
  it('does not regenerate prose because its reviewer was unavailable', async () => {
    const f = fixture();
    f.validate
      .mockResolvedValueOnce([finding('invented-wound')])
      .mockRejectedValueOnce(
        new SceneValidationUnavailableError('review offline'),
      );
    f.repair.mockResolvedValue([{ ply: 20, fantasyNarration: 'candidate' }]);
    await expect(coordinateSceneRepairs(f)).rejects.toThrow('review offline');
    expect(f.repair).toHaveBeenCalledTimes(1);
  });
});
