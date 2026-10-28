import { afterEach, expect, it, vi } from 'vitest';
import { openGeminiAudio } from './gemini-audio';

afterEach(() => vi.unstubAllGlobals());

it('never requests microphone permission if cancelled while audio is starting', async () => {
  const getUserMedia = vi.fn(async () => { throw new Error('Unexpected microphone prompt'); });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const resumes: (() => void)[] = [], closes: ReturnType<typeof vi.fn>[] = [];
  vi.stubGlobal('AudioContext', class {
    close = vi.fn(async () => {});
    constructor() { closes.push(this.close); }
    resume() { return new Promise<void>(resolve => resumes.push(resolve)); }
  });
  const signal = new AbortController();
  const connection = openGeminiAudio(vi.fn(), signal.signal);
  signal.abort(); resumes.forEach(resume => resume());
  await expect(connection).rejects.toThrow();
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(closes).toHaveLength(2);
  closes.forEach(close => expect(close).toHaveBeenCalledOnce());
});

it('plays PCM at its declared sample rate for ElevenLabs as well as Gemini', async () => {
  const rates: number[] = [], track = { stop: vi.fn() };
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn() });
  vi.stubGlobal('AudioContext', class {
    sampleRate = 16000; currentTime = 0; destination = {};
    audioWorklet = { addModule: async () => {} };
    async resume() {} async close() {}
    createMediaStreamSource() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(_channels: number, length: number, rate: number) { rates.push(rate); return { duration: length / rate, copyToChannel: vi.fn() }; }
  });
  vi.stubGlobal('AudioWorkletNode', class { port = { onmessage: null, close: vi.fn() }; connect() {} disconnect() {} });
  const audio = await openGeminiAudio(vi.fn());
  audio.play('AAAAAA==', 'audio/pcm;rate=44100');
  audio.play('AAAAAA==', 'audio/pcm;rate=24000');
  expect(rates).toEqual([44100, 24000]);
  audio.close(); expect(track.stop).toHaveBeenCalledOnce();
});
