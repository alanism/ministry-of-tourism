// Runs on the audio thread only while a PCM voice provider has the microphone open.
class BoardPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(Math.round(sampleRate / 25));
    this.at = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      this.frame[this.at++] = sample / channels.length;
      if (this.at === this.frame.length) {
        this.port.postMessage(this.frame.buffer, [this.frame.buffer]);
        this.frame = new Float32Array(Math.round(sampleRate / 25));
        this.at = 0;
      }
    }
    // Leave the output silent: microphone audio must not play through speakers.
    return true;
  }
}
registerProcessor('board-pcm-capture', BoardPcmCapture);
