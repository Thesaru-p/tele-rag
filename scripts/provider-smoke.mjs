import assert from 'node:assert/strict';
import { loadEnv } from './env.mjs';
import { embedMany, generateAnswer } from './api.mjs';

loadEnv();
try {
  const [embedding] = await embedMany(['The fictional Sunday Studio beginner pottery class costs $35.']);
  assert.equal(embedding.length, 768);
  console.log('PASS configured embedding provider returns 768 dimensions');
  const answer = await generateAnswer('How much is the beginner pottery class?', [{ file_name: 'sample.txt', content: 'The fictional Sunday Studio beginner pottery class costs $35.' }]);
  assert.equal(answer.supported, true);
  assert.deepEqual(answer.sourceIds, [1]);
  assert.match(answer.answer, /35/);
  console.log('PASS configured chat provider returns a grounded structured answer with a valid source');
} catch (error) {
  console.error('FAIL provider smoke test:', error.message);
  process.exitCode = 1;
}
