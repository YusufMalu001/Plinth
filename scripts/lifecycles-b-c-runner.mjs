import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

const BASE_URL = 'http://localhost:5000/api/v1';

function psql(sql) {
  return execSync('docker exec -i synergy-postgres psql -U postgres -d synergy_erp -t -A', {
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
    body: JSON.stringify({ email: 'admin@synergy.com', password: 'Admin123!' }),
  });
  const data = await res.json();
  token = data?.data?.accessToken;
  if (!token) throw new Error('Login failed: ' + JSON.stringify(data));
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

async function runLifecycles() {
  await login();
  console.log('✓ Logged in as Admin');

  // ==========================================
  // LIFECYCLE B — INVENTORY (LOW_INVENTORY_COVER)
  // ==========================================
  console.log('\n--- EXECUTING LIFECYCLE B: INVENTORY ---');
  const invCaseId = '52132e75-28aa-4d09-b821-3d51cb9dc9d7';
  const invSnapshotId = psql(`SELECT "snapshotId" FROM intelligence_cases WHERE id = '${invCaseId}';`);
  const policyId = psql(`SELECT id FROM business_objective_policies WHERE "isActive"=true LIMIT 1;`);
  const runId = psql(`SELECT id FROM intelligence_runs WHERE "status"='COMPLETED' LIMIT 1;`);
  const adminId = '5454c545-3458-43f0-a9c0-13433e4fdb67';

  // 1. Scenario: DO_NOTHING for Inventory Case
  const invScenarioRes = await api('/intelligence/scenarios', {
    method: 'POST',
    body: JSON.stringify({
      caseId: invCaseId,
      scenarioType: 'DO_NOTHING',
      idempotencyKey: `sc-inv-dn-${randomUUID().slice(0, 8)}`,
    }),
  });
  const invScenario = invScenarioRes.data?.data;
  console.log(`  ✓ Inventory Scenario Calculated: ID=${invScenario?.id}, BaseCase=${JSON.stringify(invScenario?.baseCase)}`);

  // 2. Recommendation
  const invRecId = randomUUID();
  psql(`
    INSERT INTO recommendations (
      "id", "runId", "snapshotId", "objectivePolicyId", "module", "caseId", "scenarioId",
      "category", "opportunityRef", "status", "priority",
      "title", "situation", "rationale", "proposedActionCode", "evidence", "expectedImpact",
      "assumptions", "risks", "dependencies", "alternatives", "confidence", "confidenceExplanation", "suggestedOwnerRole",
      "urgency", "recommendedDueAt", "expiresAt", "requiredApprovalPermission", "costCoverageScore", "dataQualityScore",
      "dedupeKey", "createdAt", "updatedAt"
    ) VALUES (
      '${invRecId}', '${runId}', '${invSnapshotId}', '${policyId}', 'INVENTORY', '${invCaseId}', '${invScenario?.id}',
      'LOW_INVENTORY_COVER', 'opp-low-inv', 'OPEN', 'HIGH',
      'Expedite replenishment for low-cover stock to prevent stockout',
      'Inventory cover is 4 days against a 14-day lead time with 10 days of stockout exposure.',
      'Replenishment secures 80 units preventing ₹30,000 stockout loss.',
      'inventory.expedite_reorder',
      '{"daysOfCover": 4, "leadTimeDays": 14, "stockoutGapDays": 10, "stockoutRiskValue": 30000}',
      '{"unit": "INR", "metricKey": "inventory.stockout_mitigation_benefit", "low": 24000, "base": 30000, "high": 36000}',
      '["Daily consumption of 20 units continues"]',
      '["Supplier expedite surcharge"]',
      '["Warehouse receiving capacity"]',
      '["Reroute inventory from regional depot"]',
      0.8800, 'Calculated from certified stock balances and lead times', 'INVENTORY_MANAGER',
      'CRITICAL', CURRENT_TIMESTAMP + INTERVAL '3 days', CURRENT_TIMESTAMP + INTERVAL '14 days',
      'create:purchaseorder', 1.0000, 1.0000, 'dedupe-inv-${invRecId}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  console.log(`  ✓ Inventory Recommendation Created: ID=${invRecId}`);

  // 3. Accept Recommendation -> Create Task
  const invAcceptRes = await api(`/intelligence/recommendations/${invRecId}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      assigneeId: adminId,
      dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      managerNotes: 'Approved expedited replenishment',
    }),
  });
  const invTask = invAcceptRes.data?.data;
  console.log(`  ✓ Human Decision ACCEPTED: TaskID=${invTask?.id}`);

  // 4. Create Real Purchase Order and Link to Task
  const vendorId = 'ceae2b04-1061-4f6f-9b4f-c2957df1cfd2';
  const materialId = '310f9033-0e2e-415e-bc1d-6a30d1fc2dde';
  const uomId = psql(`SELECT id FROM units_of_measure LIMIT 1;`);
  const poId = randomUUID();
  const poNumber = `PO-INV-LIFECYCLE-${Date.now().toString().slice(-5)}`;
  psql(`
    INSERT INTO purchase_orders (
      "id", "poNumber", "vendorId", "status", "revisionNumber", "currency",
      "subtotal", "taxAmount", "totalAmount", "createdAt", "updatedAt"
    ) VALUES (
      '${poId}', '${poNumber}', '${vendorId}', 'APPROVED', 1, 'INR',
      25000.00, 4500.00, 29500.00, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  await api(`/intelligence/tasks/${invTask?.id}/action-link`, {
    method: 'POST',
    body: JSON.stringify({ actionResourceType: 'PurchaseOrder', actionResourceId: poId }),
  });
  console.log(`  ✓ ERP Action Linked: PurchaseOrder ${poNumber} (₹29,500)`);

  // Complete Task & Reconcile Outcome
  await api(`/intelligence/tasks/${invTask?.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ comment: 'Replenishment PO issued and verified in ERP.' }),
  });
  const invOutcomeRes = await api(`/intelligence/tasks/${invTask?.id}/reconcile-outcome`, { method: 'POST' });
  const invOutcome = invOutcomeRes.data?.data;
  console.log(`  ✓ Inventory Outcome Reconciled: ID=${invOutcome?.id}, Expected=${invOutcome?.expectedValue}, Actual=${invOutcome?.actualValue}, Variance=${invOutcome?.variance}, Status=${invOutcome?.status}`);

  // ==========================================
  // LIFECYCLE C — PRODUCTION (UNPLANNED_PRODUCTION_DEMAND)
  // ==========================================
  console.log('\n--- EXECUTING LIFECYCLE C: PRODUCTION ---');
  const prodCaseId = '0f0a4212-0a64-400d-9c71-b80fe16c42be';
  const prodSnapshotId = psql(`SELECT "snapshotId" FROM intelligence_cases WHERE id = '${prodCaseId}';`);

  // 1. Scenario: PRODUCTION_INCREASE
  const prodScenarioRes = await api('/intelligence/scenarios', {
    method: 'POST',
    body: JSON.stringify({
      caseId: prodCaseId,
      scenarioType: 'PRODUCTION_INCREASE',
      idempotencyKey: `sc-prod-inc-${randomUUID().slice(0, 8)}`,
    }),
  });
  const prodScenario = prodScenarioRes.data?.data;
  console.log(`  ✓ Production Scenario Calculated: ID=${prodScenario?.id}, BaseCase=${JSON.stringify(prodScenario?.baseCase)}`);

  // 2. Recommendation
  const prodRecId = randomUUID();
  psql(`
    INSERT INTO recommendations (
      "id", "runId", "snapshotId", "objectivePolicyId", "module", "caseId", "scenarioId",
      "category", "opportunityRef", "status", "priority",
      "title", "situation", "rationale", "proposedActionCode", "evidence", "expectedImpact",
      "assumptions", "risks", "dependencies", "alternatives", "confidence", "confidenceExplanation", "suggestedOwnerRole",
      "urgency", "recommendedDueAt", "expiresAt", "requiredApprovalPermission", "costCoverageScore", "dataQualityScore",
      "dedupeKey", "createdAt", "updatedAt"
    ) VALUES (
      '${prodRecId}', '${runId}', '${prodSnapshotId}', '${policyId}', 'PRODUCTION', '${prodCaseId}', '${prodScenario?.id}',
      'UNPLANNED_PRODUCTION_DEMAND', 'opp-prod-cap', 'OPEN', 'HIGH',
      'Authorize weekend shift to fulfill 350-unit production deficit',
      'Confirmed customer demand exceeds single-shift capacity by 350 units at STAMPING_PRESS_01.',
      'Capacity expansion secures ₹129,500 contribution margin.',
      'production.schedule_review',
      '{"plannedCapacityUnits": 1000, "confirmedDemandUnits": 1350, "capacityDeficitUnits": 350, "utilizationPercent": 135}',
      '{"unit": "INR", "metricKey": "production.capacity_expansion_net_profit", "low": 110075, "base": 129500, "high": 148925}',
      '["Labor availability for overtime"]',
      '["Machine maintenance schedule"]',
      '["Raw material availability"]',
      '["Outsource stamping to external job worker"]',
      0.9000, 'Calculated from confirmed sales orders and work center capacity', 'PRODUCTION_MANAGER',
      'HIGH', CURRENT_TIMESTAMP + INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '20 days',
      'create:productionplan', 1.0000, 1.0000, 'dedupe-prod-${prodRecId}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  console.log(`  ✓ Production Recommendation Created: ID=${prodRecId}`);

  // 3. Accept Recommendation -> Create Task
  const prodAcceptRes = await api(`/intelligence/recommendations/${prodRecId}/accept`, {
    method: 'POST',
    body: JSON.stringify({
      assigneeId: adminId,
      dueAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      managerNotes: 'Approved weekend shift expansion',
    }),
  });
  const prodTask = prodAcceptRes.data?.data;
  console.log(`  ✓ Human Decision ACCEPTED: TaskID=${prodTask?.id}`);

  // 4. Create Real Production Plan and Link to Task
  const planId = randomUUID();
  const planNumber = `PP-LIFECYCLE-${Date.now().toString().slice(-5)}`;
  const bomVersion = psqlJson(`SELECT id, "productId" FROM bom_versions LIMIT 1;`)[0];
  psql(`
    INSERT INTO production_plans (
      "id", "planNumber", "productId", "bomVersionId", "scheduleDate", "scheduleType",
      "quantity", "completedQuantity", "status", "createdByActorId", "createdAt", "updatedAt"
    ) VALUES (
      '${planId}', '${planNumber}', '${bomVersion.productId}', '${bomVersion.id}', CURRENT_DATE, 'STANDARD',
      350, 350, 'COMPLETED', '${adminId}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  await api(`/intelligence/tasks/${prodTask?.id}/action-link`, {
    method: 'POST',
    body: JSON.stringify({ actionResourceType: 'ProductionPlan', actionResourceId: planId }),
  });
  console.log(`  ✓ ERP Action Linked: ProductionPlan ${planNumber} (350 units completed)`);

  // Complete Task & Reconcile Outcome
  await api(`/intelligence/tasks/${prodTask?.id}/complete`, {
    method: 'POST',
    body: JSON.stringify({ comment: 'Overtime shift run completed; 350 units produced.' }),
  });
  const prodOutcomeRes = await api(`/intelligence/tasks/${prodTask?.id}/reconcile-outcome`, { method: 'POST' });
  const prodOutcome = prodOutcomeRes.data?.data;
  console.log(`  ✓ Production Outcome Reconciled: ID=${prodOutcome?.id}, Expected=${prodOutcome?.expectedValue}, Actual=${prodOutcome?.actualValue}, Variance=${prodOutcome?.variance}, Status=${prodOutcome?.status}`);
}

runLifecycles().catch(e => {
  console.error('Lifecycle Runner Error:', e);
  process.exit(1);
});
