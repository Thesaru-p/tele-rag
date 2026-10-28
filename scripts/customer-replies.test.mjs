import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApi, generateAnswer } from './api.mjs';
import { fallbackAnswer } from './limits.mjs';
import { mockServices, documentId } from './test-support/mock-services.mjs';

test('customer replies come from the question and retrieved documents', async t => {
  const originalFetch = globalThis.fetch;
  const fixture = mockServices();
  process.env.SUPABASE_URL = 'https://release-test.supabase.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-service-key';
  process.env.OPENROUTER_API_KEY = 'test-only-ai-key';
  globalThis.fetch = fixture.fetch;
  const call = async question => {
    const res = {status: 0, body: null, writeHead(status) {this.status = status;}, end(raw) {this.body = JSON.parse(raw);}};
    await handleApi({url: '/api/chat', method: 'POST', headers: {authorization: 'Bearer test-access'}, body: {question}}, res);
    assert.equal(res.status, 200);
    return res.body;
  };
  try {
    for (const scenario of [
      {name: 'Workshop.md', question: 'Can you repair my lamp?', excerpt: 'Lamp repairs require an in-person inspection on weekdays.', reply: 'We inspect lamps in person on weekdays before confirming a repair.'},
      {name: 'Event.md', question: 'How do I join the event?', excerpt: 'Register at the reception desk before 4 pm Friday.', reply: 'Register at reception before 4 pm on Friday to join.'},
    ]) {
      await t.test(`adapts to ${scenario.name} without domain-specific reply rules`, async () => {
        fixture.data.documents[0].file_name = scenario.name;
        fixture.matches = [{id: 1, document_id: documentId, content: scenario.excerpt, similarity: .9}];
        fixture.generated = {answer: scenario.reply, supported: true, source_ids: [1]};
        const result = await call(scenario.question);
        assert.equal(result.answer, scenario.reply);
        assert.deepEqual(result.sources, [scenario.name]);
        const request = fixture.calls.filter(call => call.url.pathname.endsWith('/chat/completions')).at(-1);
        assert.ok(request.body.messages[1].content.includes(scenario.question));
        assert.ok(request.body.messages[1].content.includes(scenario.excerpt));
      });
    }
    await t.test('preserves generated missing-information replies and logs the gap', async () => {
      const question = 'Can you repair antique clocks as well?';
      fixture.generated = {answer: 'I can confirm lamp inspections, but I don’t have information about antique clock repairs. Could you check with the workshop?', supported: false, source_ids: []};
      const result = await call(question);
      assert.equal(result.answer, fixture.generated.answer);
      assert.equal(result.supported, false);
      assert.deepEqual(result.sources, []);
      assert.equal(fixture.data.unanswered_questions.at(-1).question, question);
      assert.equal(fixture.data.conversations.at(-1).content, result.answer);
    });
    await t.test('no relevant passages still produces a generated reply without business facts', async () => {
      fixture.matches = [];
      fixture.generated = {answer: 'I can’t confirm that from the available information. What service are you asking about?', supported: false, source_ids: []};
      const result = await call('Is that included?');
      assert.equal(result.answer, fixture.generated.answer);
      assert.equal(result.supported, false);
      const request = fixture.calls.filter(call => call.url.pathname.endsWith('/chat/completions')).at(-1);
      assert.ok(!request.body.messages[1].content.includes('[Source'));
    });
    await t.test('invalid citations cannot validate generated business facts', async () => {
      fixture.generated = {answer: 'Invented business fact.', supported: true, source_ids: [999]};
      const result = await generateAnswer('Can you do that?', [{file_name: 'notes.md', content: 'Unrelated information.'}]);
      assert.equal(result.answer, fallbackAnswer);
      assert.equal(result.supported, false);
      assert.deepEqual(result.sourceIds, []);
    });
    await t.test('no ready documents use a neutral response without provider calls', async () => {
      fixture.data.documents[0].status = 'failed';
      const before = fixture.calls.filter(call => call.url.hostname === 'openrouter.ai').length;
      const result = await call('Can you help me?');
      assert.equal(fixture.calls.filter(call => call.url.hostname === 'openrouter.ai').length, before);
      assert.equal(result.answer, fallbackAnswer);
    });
  } finally {globalThis.fetch = originalFetch;}
});
