import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bodyForOpenAiTranscription } from '../api/transcribe.ts';

test('OpenAI fallback rewrites only the multipart model field', () => {
  const boundary = 'menuvoice-boundary';
  const audioBytes = Buffer.from([0, 255, 12, 10, ...Buffer.from('audio ink-whisper payload'), 0]);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="speech.webm"\r\n'),
    Buffer.from('Content-Type: audio/webm\r\n\r\n'),
    audioBytes,
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="model"\r\n\r\n'),
    Buffer.from('ink-whisper'),
    Buffer.from(`\r\n--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="language"\r\n\r\n'),
    Buffer.from('en'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const rewritten = bodyForOpenAiTranscription(`multipart/form-data; boundary=${boundary}`, body);

  assert.ok(rewritten.includes(audioBytes), 'audio payload is preserved exactly');
  assert.match(rewritten.toString('latin1'), /name="model"\r\n\r\nwhisper-1\r\n/);
  assert.ok(rewritten.toString('latin1').includes('audio ink-whisper payload'));
});

test('OpenAI fallback leaves non-multipart bodies untouched', () => {
  const body = Buffer.from('ink-whisper');
  assert.equal(bodyForOpenAiTranscription('application/octet-stream', body), body);
});
