// Renders every narration line to vo/lines/<id>.wav (24 kHz mono) and writes
// vo/lines.json with each line's duration. Needs the TTS toolchain described in
// vo/README.md (kokoro-js, onnxruntime-node, the Kokoro-82M fp32 weights).
//   TTS_DIR=/path/to/toolchain node vo/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TTS_DIR = process.env.TTS_DIR;
if (!TTS_DIR) throw new Error('Set TTS_DIR to the folder holding kokoro.mjs, kokoro-fp32.onnx and node_modules');
const { tts } = await import(pathToFileURL(path.join(TTS_DIR, 'kokoro.mjs')).href);
const S = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'));
fs.mkdirSync(path.join(HERE, 'lines'), { recursive: true });
const out = {};
for (const l of S.lines) {
  const a = await tts.generate(l.say, { voice: S.voice, speed: l.speed ?? 1 });
  a.save(path.join(HERE, 'lines', `${l.id}.wav`));
  out[l.id] = { text: l.text, dur: +(a.audio.length / a.sampling_rate).toFixed(3) };
  console.log(l.id, out[l.id].dur.toFixed(2) + 's', l.text);
}
fs.writeFileSync(path.join(HERE, 'lines.json'), JSON.stringify(out, null, 1));
