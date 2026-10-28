import { decodePcm, encodePcm } from './pcm';

export interface GeminiAudio {
  play(data: string, mimeType: string): void;
  interrupt(): void;
  close(): void;
}

/** No capture, contexts or worklet are created until the writer starts live voice. */
export async function openGeminiAudio(onAudio: (data: string, rate: number) => void, signal?: AbortSignal): Promise<GeminiAudio> {
  signal?.throwIfAborted();
  const input = new AudioContext({ sampleRate: 16000 });
  let output: AudioContext | undefined;
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let capture: AudioWorkletNode | undefined;
  let closed = false;
  let nextStart = 0;
  const playing = new Set<AudioBufferSourceNode>();
  const interrupt = () => {
    for (const node of playing) { node.onended = null; try { node.stop(); } catch { /* Already ended. */ } node.disconnect(); }
    playing.clear(); nextStart = 0;
  };
  const close = () => {
    if (closed) return;
    closed = true; signal?.removeEventListener('abort', close);
    stream?.getTracks().forEach(track => track.stop());
    if (capture) { capture.port.onmessage = null; capture.disconnect(); capture.port.close(); }
    source?.disconnect(); interrupt();
    void input.close().catch(() => {}); void output?.close().catch(() => {});
  };
  signal?.addEventListener('abort', close, { once: true });
  try {
    output = new AudioContext({ sampleRate: 24000 });
    await Promise.all([input.resume(), output.resume()]);
    if (closed || signal?.aborted) throw new DOMException('Voice connection cancelled.', 'AbortError');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (closed || signal?.aborted) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Voice connection cancelled.', 'AbortError'); }
    await input.audioWorklet.addModule(new URL('./pcm-capture.js', import.meta.url));
    signal?.throwIfAborted();
    if (closed) throw new DOMException('Voice connection cancelled.', 'AbortError');
    capture = new AudioWorkletNode(input, 'board-pcm-capture', { channelCount: 1, channelCountMode: 'explicit' });
    capture.port.onmessage = event => {
      if (!closed && event.data instanceof ArrayBuffer) onAudio(encodePcm(new Float32Array(event.data)), input.sampleRate);
    };
    source = input.createMediaStreamSource(stream);
    source.connect(capture); capture.connect(input.destination);
    return {
      interrupt, close,
      play(data, mimeType) {
        if (closed || !output) return;
        const format = /^audio\/pcm;rate=(16000|22050|24000|44100|48000)$/.exec(mimeType);
        if (!format) throw new Error('The voice provider returned an unsupported audio format.');
        const samples = decodePcm(data);
        if (!samples.length) return;
        const buffer = output.createBuffer(1, samples.length, Number(format[1]));
        buffer.copyToChannel(samples, 0);
        const node = output.createBufferSource(); node.buffer = buffer; node.connect(output.destination);
        const start = Math.max(output.currentTime, nextStart);
        nextStart = start + buffer.duration;
        playing.add(node); node.onended = () => { playing.delete(node); node.disconnect(); };
        node.start(start);
      },
    };
  } catch (error) { close(); throw error; }
}
