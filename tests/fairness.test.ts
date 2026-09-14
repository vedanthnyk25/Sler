import test from "node:test";
import assert from "node:assert/strict";

const API_URL = "http://localhost:3000/api/execute";

async function executeCode(code: string, tenantId: string) {
  const start = Date.now();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, tenantId }),
  });
  const data = await res.json();
  const duration = Date.now() - start;
  return { status: res.status, data, duration };
}

test("Phase 2: Scheduling & Fairness", async (t) => {
  await t.test("Tenant B is not starved by Tenant A's heavy workload", async () => {
    // A script that takes roughly ~500ms to complete
    const slowCode = `
      let sum = 0;
      const end = Date.now() + 500;
      while(Date.now() < end) { sum += 1; }
      sum;
    `;
    const fastCode = "1 + 1;";

    // Tenant A floods the system, exhausting the 4-worker pool
    const floodPromises = Array.from({ length: 8 }).map(() =>
      executeCode(slowCode, "tenant-A")
    );

    // Give Tenant A a tiny head start to ensure their jobs hit the queue first
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Tenant B submits a single, fast job
    const tenantBResult = await executeCode(fastCode, "tenant-B");

    // Await all of Tenant A's results
    const tenantAResults = await Promise.all(floodPromises);

    // Calculate metrics
    const avgTenantATime = tenantAResults.reduce((sum, r) => sum + r.duration, 0) / tenantAResults.length;

    // Assertions
    assert.equal(tenantBResult.status, 200, "Tenant B request should succeed");
    assert.equal(tenantBResult.data.result, 2, "Tenant B should get correct result");

    // If FIFO was used, Tenant B would wait for Tenant A's backlog (latency > ~1000ms).
    // With Round-Robin, Tenant B should execute as soon as the first worker frees up (~500ms).
    assert.ok(
      tenantBResult.duration < avgTenantATime,
      `Fairness failed: Tenant B took ${tenantBResult.duration}ms, expected to be significantly faster than Tenant A's average of ${avgTenantATime}ms.`
    );
    
    console.log(`\nMetrics:\nTenant B latency: ${tenantBResult.duration}ms\nTenant A average latency: ${Math.round(avgTenantATime)}ms`);
  });
});
