// Offline Kokoro-82M (fp32) narration. kokoro-js supplies the phonemizer and the
// voice styles; the ONNX graph runs on onnxruntime-node. This file is copied
// into the toolchain folder by setup-tts.sh, next to the weights and node_modules.
import fs from 'node:fs';
import * as ort from 'onnxruntime-node';
import { KokoroTTS } from 'kokoro-js';
const here = (f) => new URL(f, import.meta.url).pathname;
const { vocab } = JSON.parse(fs.readFileSync(here('./kokoro-vocab.json'), 'utf8'));
const sess = await ort.InferenceSession.create(here('./kokoro-fp32.onnx'), { intraOpNumThreads: 4 });
// Kokoro's tokenizer is a character-level map of the phoneme alphabet, padded with id 0.
const tokenizer = (ph) => {
  const ids = [0];
  for (const ch of ph) if (ch in vocab) ids.push(vocab[ch]);
  ids.push(0);
  return { input_ids: { dims: [1, ids.length], data: BigInt64Array.from(ids.map(BigInt)) } };
};
const model = async (x) => {
  const out = await sess.run({
    input_ids: new ort.Tensor('int64', x.input_ids.data, x.input_ids.dims),
    style: new ort.Tensor('float32', x.style.data, x.style.dims),
    speed: new ort.Tensor('float32', x.speed.data, x.speed.dims),
  });
  return { waveform: out.waveform };
};
export const tts = new KokoroTTS(model, tokenizer);
