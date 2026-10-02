import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStreamParser } from '../src/lib/chat-stream.mjs';
const response = '__STATUS__:Searching documents...\nHello **world**\n\n| A | B |\n__PAGINATION__:{"hasMore":true,"remaining":12}\n__TOKEN_USAGE__:{"total":9}\n__CONV_ID__:conversation-1\n';
for (let size = 1; size <= response.length; size++) {
  test(`control records survive chunks of ${size} characters`, () => {
    let text = ''; const records = [];
    const parser = createChatStreamParser(v => text += v, (key, value) => records.push([key, value]));
    for (let i = 0; i < response.length; i += size) parser.push(response.slice(i, i + size));
    parser.finish();
    assert.equal(text, 'Hello **world**\n\n| A | B |\n');
    assert.deepEqual(records.map(r => r[0]), ['STATUS', 'PAGINATION', 'TOKEN_USAGE', 'CONV_ID']);
    assert.equal(JSON.parse(records[1][1]).remaining, 12);
  });
}
test('flushes prose and an unterminated final control record', () => {
  let text = ''; const records = [];
  const parser = createChatStreamParser(v => text += v, (...r) => records.push(r));
  parser.push('नमस्ते _'); parser.push('answer\n__CONV_ID__:abc'); parser.finish();
  assert.equal(text, 'नमस्ते _answer\n'); assert.deepEqual(records, [['CONV_ID', 'abc']]);
});
test('decodes multi-byte UTF-8 across individual network bytes', () => {
  let text = ''; const records = [];
  const parser = createChatStreamParser(v => text += v, (...r) => records.push(r));
  const decoder = new TextDecoder();
  for (const byte of new TextEncoder().encode('__STATUS__:खोज\nनमस्ते 🌿\n__CONV_ID__:id\n')) {
    parser.push(decoder.decode(Uint8Array.of(byte), { stream: true }));
  }
  parser.push(decoder.decode()); parser.finish();
  assert.equal(text, 'नमस्ते 🌿\n');
  assert.deepEqual(records, [['STATUS', 'खोज'], ['CONV_ID', 'id']]);
});
