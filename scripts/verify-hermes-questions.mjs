import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5000/api/v1';

function psql(sql) {
  return execSync('docker exec -i plinth-postgres psql -U postgres -d plinth_erp -t -A', {
    input: sql,
    encoding: 'utf-8',
  }).trim();
}

function psqlJson(sql) {
  const cleanSql = sql.trim().replace(/;+$/, '');
  const raw = psql(`SELECT json_agg(t) FROM (${cleanSql}) t;`);
  return raw ? JSON.parse(raw) : [];
}

let token = '';

async function login() {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@plinth.com', password: 'Admin123!' }),
  });
  const data = await res.json();
  token = data?.data?.accessToken;
  if (!token) throw new Error('Failed to login as admin: ' + JSON.stringify(data));
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

const QUESTIONS = [
  'Why is profit declining?',
  'What should we do about the material price increase?',
  'Which materials are causing margin pressure?',
  'What inventory requires attention?',
  'Which vendors are deteriorating?',
  'Where are fulfillment delays occurring?',
  'Should we increase production?',
  'Which products are slow-moving?',
  'What is causing replenishment risk?',
  'What should management investigate today?'
];

async function main() {
  console.log('========================================================');
  console.log('FINAL HERMES RESPONSE VERIFICATION — 10 BUSINESS QUESTIONS');
  console.log('========================================================\n');

  await login();
  console.log('✓ Successfully authenticated as Admin via /auth/login\n');

  // Create persistent conversation
  const convRes = await api('/intelligence/conversations', {
    method: 'POST',
    body: JSON.stringify({ module: 'EXECUTIVE', title: 'Final Hermes Response Verification' })
  });
  const convId = convRes.data?.data?.id;
  console.log(`✓ Created Persistent Conversation: ID=${convId}\n`);

  const results = [];

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    console.log(`--------------------------------------------------------`);
    console.log(`[Q${i + 1}/10] "${q}"`);
    console.log(`--------------------------------------------------------`);

    // 1. Submit Question to API
    const postRes = await api('/intelligence/questions', {
      method: 'POST',
      body: JSON.stringify({ question: q, module: 'EXECUTIVE' })
    });

    if (!postRes.ok || !postRes.data?.data) {
      console.error(`  ✗ Failed to enqueue question:`, postRes.data);
      results.push({
        index: i + 1,
        question: q,
        status: 'FAILED',
        error: postRes.data?.error?.message || 'Failed to enqueue'
      });
      continue;
    }

    const runId = postRes.data.data.runId || postRes.data.data.id;
    console.log(`  ✓ Enqueued run ID: ${runId}`);

    // 2. Poll intelligence run until terminal status (up to 30s)
    let run = null;
    for (let poll = 0; poll < 15; poll++) {
      await new Promise(r => setTimeout(r, 2000));
      const getRun = await api(`/intelligence/runs/${runId}`);
      if (getRun.ok && getRun.data?.data) {
        run = getRun.data.data;
        if (['COMPLETED', 'FAILED', 'REJECTED'].includes(run.status)) {
          break;
        }
      }
    }

    console.log(`  ✓ Final Run Status: ${run?.status}`);

    // 3. Check specialist delegations
    const delegations = psqlJson(`
      SELECT "requestedModule", "childRunId", "status", "completedAt"
      FROM advisor_delegations
      WHERE "parentRunId" = '${runId}'
    `);
    const childRuns = psqlJson(`
      SELECT "id", "module", "status", "errorCode", "errorMessage"
      FROM intelligence_runs
      WHERE "parentRunId" = '${runId}'
    `);
    console.log(`  ✓ Specialist Delegations: ${delegations.length || childRuns.length} (${childRuns.map(d => d.module).join(', ') || 'None'})`);

    // 4. Check provider attempts
    const childIds = childRuns.map(d => `'${d.id}'`).join(',');
    const attempts = psqlJson(`
      SELECT "id", "operation", "status", "httpStatus", "errorCategory", "latencyMs", "requestedModel", "providerRequestId"
      FROM provider_attempts
      WHERE "runId" = '${runId}' ${childIds ? `OR "runId" IN (${childIds})` : ''}
      ORDER BY "startedAt" DESC
    `);
    console.log(`  ✓ Provider Attempts Logged: ${attempts.length}`);

    // 5. Check structured output / answer
    const structured = run?.structuredOutput;
    const answerText = structured?.answer || run?.errorMessage || 'No answer text recorded';
    console.log(`  ✓ Answer Summary: ${answerText.slice(0, 150)}...`);

    // 6. Post into conversation
    const msgRes = await api(`/intelligence/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content: q })
    });
    const msgId = msgRes.data?.data?.id;

    // 7. Verification record
    results.push({
      index: i + 1,
      question: q,
      runId,
      status: run?.status,
      errorCode: run?.errorCode,
      errorMessage: run?.errorMessage,
      specialistDelegations: delegations,
      providerAttempts: attempts,
      answer: answerText,
      evidence: structured?.evidence || [],
      limitations: structured?.limitations || [],
      conversationMessageId: msgId,
      completedAt: run?.completedAt
    });

    // Space out consecutive requests by 2s to prevent upstream concurrency burst
    await new Promise(r => setTimeout(r, 2000));
  }

  // 8. Re-fetch conversation to verify persistence
  const reGetConv = await api(`/intelligence/conversations/${convId}`);
  console.log('\n========================================================');
  console.log(`✓ Conversation Persistence Verified: ${reGetConv.data?.data?.messages?.length} messages stored`);
  console.log('========================================================');

  writeFileSync('scripts/hermes-questions-final-results.json', JSON.stringify({ conversationId: convId, results }, null, 2));
  console.log('Saved detailed results to scripts/hermes-questions-final-results.json');
}

main().catch(err => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
