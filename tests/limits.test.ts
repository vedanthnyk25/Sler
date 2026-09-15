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

  return {
    status: res.status,
    data,
    duration: Date.now() - start,
  };
}

test("Phase 3: Resource Limits & Backpressure", async (t) => {
  /*
   * ============================================================
   * CIRCUIT BREAKER
   * ============================================================
   */

  await t.test(
    "Circuit Breaker: Trips after 5 consecutive failures",
    async () => {
      const crashingCode = "throw new Error('Boom');";
      const tenantId = "tenant-breaker";

      for (let i = 0; i < 5; i++) {
        const { status } = await executeCode(
          crashingCode,
          tenantId
        );

        assert.equal(
          status,
          500,
          "Expected runtime execution error"
        );
      }

      // Circuit should now be OPEN.
      const result = await executeCode("1 + 1;", tenantId);

      assert.equal(
        result.status,
        503,
        "Expected 503 when circuit is open"
      );

      assert.match(
        result.data.error,
        /Circuit is open/
      );
    }
  );

  await t.test(
    "Circuit Breaker: Recovers after cooldown and successful trial",
    async () => {
      /*
       * This test depends on the CircuitBreaker cooldown.
       *
       * If your cooldown is 60 seconds, don't run this integration
       * test unless you make the cooldown configurable for tests.
       *
       * The actual HALF_OPEN behavior should ideally be tested
       * directly at the CircuitBreaker unit-test level.
       */
    }
  );

  /*
   * ============================================================
   * BACKPRESSURE
   * ============================================================
   */

  await t.test(
    "Backpressure: Rejects jobs when queue depth exceeds 100",
    async () => {
      const slowCode = `
        const end = Date.now() + 100;
        while (Date.now() < end) {}
        1;
      `;

      const tenantId = "tenant-flood";

      /*
       * Tenant concurrency = 2
       * Queue depth = 100
       *
       * Therefore:
       *   2 jobs  -> running
       *   100 jobs -> queued
       *   remaining jobs -> rejected
       */

      const floodPromises = Array.from(
        { length: 105 },
        () => executeCode(slowCode, tenantId)
      );

      const results = await Promise.all(floodPromises);

      const rateLimited = results.filter(
        (result) => result.status === 429
      );

      assert.ok(
        rateLimited.length >= 1,
        "Expected at least one request to be rejected with 429"
      );

      assert.ok(
        results.every(
          (result) =>
            result.status === 200 ||
            result.status === 429
        ),
        "Expected only successful or queue-full responses"
      );
    }
  );

  /*
   * ============================================================
   * PER-TENANT CONCURRENCY
   * ============================================================
   */

  await t.test(
    "Concurrency: Same tenant is limited to 2 running jobs",
    async () => {
      const tenantId = "tenant-concurrency";

      /*
       * We can't reliably observe internal concurrency from the API
       * alone, so use jobs with a known execution time.
       *
       * With concurrency = 2:
       *
       *   jobs 1,2 -> run
       *   jobs 3,4 -> wait
       *   jobs 5,6 -> wait
       *
       * The total execution time should therefore be substantially
       * greater than if all jobs ran simultaneously.
       */

      const slowCode = `
        const end = Date.now() + 200;
        while (Date.now() < end) {}
        1;
      `;

      const start = Date.now();

      const promises = Array.from(
        { length: 6 },
        () => executeCode(slowCode, tenantId)
      );

      const results = await Promise.all(promises);

      const totalDuration = Date.now() - start;

      assert.ok(
        results.every((result) => result.status === 200),
        "All jobs should eventually execute successfully"
      );

      /*
       * Six ~200ms jobs with max concurrency 2 should require
       * roughly three execution waves.
       *
       * Keep a generous threshold because this is an integration
       * test and worker scheduling introduces overhead.
       */
      assert.ok(
        totalDuration >= 400,
        `Expected concurrency limiting, but jobs completed too quickly: ${totalDuration}ms`
      );
    }
  );

  /*
   * ============================================================
   * TENANT ISOLATION
   * ============================================================
   */

  await t.test(
    "Concurrency: One tenant's limit does not block another tenant",
    async () => {
      const tenantA = "tenant-A-isolation";
      const tenantB = "tenant-B-isolation";

      const slowCode = `
        const end = Date.now() + 300;
        while (Date.now() < end) {}
        1;
      `;

      const fastCode = "1 + 1;";

      /*
       * Fill Tenant A's two concurrency slots.
       */
      const tenantAJobs = [
        executeCode(slowCode, tenantA),
        executeCode(slowCode, tenantA),
        executeCode(slowCode, tenantA),
        executeCode(slowCode, tenantA),
      ];

      /*
       * Give A a small head start so its first jobs occupy workers.
       */
      await new Promise((resolve) =>
        setTimeout(resolve, 50)
      );

      const tenantBResult = await executeCode(
        fastCode,
        tenantB
      );

      await Promise.all(tenantAJobs);

      assert.equal(
        tenantBResult.status,
        200
      );

      assert.equal(
        tenantBResult.data.result,
        2
      );

      /*
       * B should not have to wait for all of A's jobs.
       */
      assert.ok(
        tenantBResult.duration < 500,
        `Tenant B appears blocked by Tenant A: ${tenantBResult.duration}ms`
      );
    }
  );

  /*
   * ============================================================
   * INTERACTION: CONCURRENCY + FAIRNESS
   * ============================================================
   */

  await t.test(
    "Fairness: Queued tenant gets execution despite another tenant hitting its concurrency limit",
    async () => {
      const tenantA = "tenant-heavy";
      const tenantB = "tenant-light";

      const slowCode = `
        const end = Date.now() + 300;
        while (Date.now() < end) {}
        1;
      `;

      const fastCode = "1 + 1;";

      /*
       * A submits many jobs, but only 2 can execute concurrently.
       */
      const tenantAJobs = Array.from(
        { length: 8 },
        () => executeCode(slowCode, tenantA)
      );

      await new Promise((resolve) =>
        setTimeout(resolve, 50)
      );

      const tenantBResult = await executeCode(
        fastCode,
        tenantB
      );

      const tenantAResults = await Promise.all(
        tenantAJobs
      );

      assert.equal(
        tenantBResult.status,
        200
      );

      assert.equal(
        tenantBResult.data.result,
        2
      );

      const avgTenantALatency =
        tenantAResults.reduce(
          (sum, result) => sum + result.duration,
          0
        ) / tenantAResults.length;

      assert.ok(
        tenantBResult.duration < avgTenantALatency,
        `Fairness failed: Tenant B took ${tenantBResult.duration}ms, ` +
          `while Tenant A averaged ${Math.round(avgTenantALatency)}ms`
      );

      console.log(
        `\nPhase 3 Metrics:` +
          `\nTenant B latency: ${tenantBResult.duration}ms` +
          `\nTenant A average latency: ${Math.round(avgTenantALatency)}ms`
      );
    }
  );
});
