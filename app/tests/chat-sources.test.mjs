import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSourceDocs } from '../src/lib/chat-utils.js';
test('source citations preserve brackets and escaped quotes inside excerpts', () => {
 const documents = [{id:'doc',label:'Policy [appendix].pdf',citations:[{page:3,excerpt:'Section [a] includes "quotes" and a \\ path.'}]}];
 assert.deepEqual(parseSourceDocs(`Sources:\n__SOURCE_DOCS__:${JSON.stringify(documents)}\n__CONV_ID__:id`), documents);
});
test('incomplete source metadata waits for completion', () => {
 assert.equal(parseSourceDocs('__SOURCE_DOCS__:[{"label":"Still [streaming]"'), null);
});
