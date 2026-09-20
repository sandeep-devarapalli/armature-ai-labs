import { SignatureRenderer } from '../../src/lib/motion/signature-renderer';

const playback = Object.getPrototypeOf(SignatureRenderer.prototype);

function pendingPlay() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  return {
    video: { play: vi.fn<() => Promise<void>>(), pause: vi.fn() },
    loaded: true, paused: false, failed: false, destroyed: false, inView: true,
    get active() { return !this.failed && !this.destroyed && this.inView; },
    stats: { paused: false }, stamps: [],
    requestDraw: vi.fn(), stopFrames: vi.fn(), clearTouch: vi.fn(),
    cancelVideoFrame: vi.fn(), scheduleVideo: vi.fn(), resolveReady: vi.fn(), onStatus: vi.fn(),
  };
}

describe('motion playback lifecycle', () => {
  it('keeps the fallback status when pending playback rejects', async () => {
    const renderer = fixture(), attempt = pendingPlay();
    renderer.video.play.mockReturnValue(attempt.promise);
    playback.syncPlayback.call(renderer);
    playback.fallback.call(renderer, 'Video failed');
    attempt.reject(new Error('Aborted'));
    await attempt.promise.catch(() => {});
    await Promise.resolve();
    expect(renderer.onStatus.mock.calls).toEqual([[{ state: 'fallback', message: 'Video failed' }]]);
  });

  it('ignores an old rejection after hiding and starting a new play attempt', async () => {
    const renderer = fixture(), oldAttempt = pendingPlay(), newAttempt = pendingPlay();
    renderer.video.play.mockReturnValueOnce(oldAttempt.promise).mockReturnValueOnce(newAttempt.promise);
    playback.syncPlayback.call(renderer);
    renderer.inView = false;
    playback.syncPlayback.call(renderer);
    renderer.inView = true;
    playback.syncPlayback.call(renderer);
    oldAttempt.reject(new Error('Aborted'));
    await oldAttempt.promise.catch(() => {});
    await Promise.resolve();
    expect(renderer.paused).toBe(false);
    expect(renderer.onStatus).not.toHaveBeenCalled();
    newAttempt.resolve();
    await newAttempt.promise;
    expect(renderer.scheduleVideo).toHaveBeenCalledOnce();
  });

  it('offers Play when the current active autoplay attempt is rejected', async () => {
    const renderer = fixture(), attempt = pendingPlay();
    renderer.video.play.mockReturnValue(attempt.promise);
    playback.syncPlayback.call(renderer);
    attempt.reject(new Error('Autoplay denied'));
    await attempt.promise.catch(() => {});
    await Promise.resolve();
    expect(renderer.paused).toBe(true);
    expect(renderer.stats.paused).toBe(true);
    expect(renderer.onStatus).toHaveBeenCalledWith({ state: 'ready', message: 'Playback is paused. Use Play to start.' });
  });

  it.each(['destroyed', 'paused'] as const)('ignores a rejection after becoming %s', async (state) => {
    const renderer = fixture(), attempt = pendingPlay();
    renderer.video.play.mockReturnValue(attempt.promise);
    playback.syncPlayback.call(renderer);
    renderer[state] = true;
    attempt.reject(new Error('Aborted'));
    await attempt.promise.catch(() => {});
    await Promise.resolve();
    expect(renderer.onStatus).not.toHaveBeenCalled();
  });
});
