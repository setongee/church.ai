// Microphone -> 16 kHz mono PCM in 100 ms chunks, for the speech engines that want raw audio (the server one and the
// on-device one). Runs in an AudioWorklet so it never stutters when the page is busy.

export interface PcmCapture {
  stream: MediaStream;
  stop: () => void;
}

const WORKLET = `
class Pcm16k extends AudioWorkletProcessor {
  constructor() { super(); this.ratio = sampleRate / 16000; this.acc = 0; this.sum = 0; this.out = new Float32Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.sum += ch[i]; this.acc += 1;
      if (this.acc >= this.ratio) {
        this.out[this.n++] = this.sum / this.acc; this.acc -= this.ratio; this.sum = 0;
        if (this.n === 1600) { this.port.postMessage(this.out.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor('pcm16k', Pcm16k);
`;

export async function startPcmCapture(opts: { deviceId?: string; onChunk: (pcm: Float32Array) => void }): Promise<PcmCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { ...(opts.deviceId ? { deviceId: { exact: opts.deviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext();
  try {
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16k");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => opts.onChunk(e.data);
    const mute = ctx.createGain(); // some browsers only run a worklet that is connected onward
    mute.gain.value = 0;
    src.connect(node).connect(mute).connect(ctx.destination);
    if (ctx.state === "suspended") await ctx.resume();
    return {
      stream,
      stop: () => {
        node.port.onmessage = null;
        try {
          src.disconnect();
          node.disconnect();
        } catch {}
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    throw err;
  }
}

export const toInt16 = (f: Float32Array): Int16Array => {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
};
