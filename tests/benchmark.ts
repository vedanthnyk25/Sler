import { performance } from "node:perf_hooks";

const BASE_URL = "http://localhost:3000";
const TOTAL_REQUESTS = 1000;
const CONCURRENCY = 8;
const WARMUP_REQUESTS = 100;

const TENANTS = [
  "benchmark-tenant-1",
  "benchmark-tenant-2",
  "benchmark-tenant-3",
  "benchmark-tenant-4",
  "benchmark-tenant-5",
  "benchmark-tenant-6",
  "benchmark-tenant-7",
  "benchmark-tenant-8",
];

const CODE = `
  let sum = 0;
  for (let i = 0; i < 100; i++) {
    sum += i;
  }
  sum;
`;

interface Result {
  latency: number;
  success: boolean;
  status: number;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  const index = (p / 100) * (sorted.length - 1);

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower]!;
  }

  return (
    sorted[lower]! +
    (sorted[upper]! - sorted[lower]!) *
      (index - lower)
  );
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;

  return (
    values.reduce((sum, value) => sum + value, 0) /
    values.length
  );
}

async function sendRequest(index: number): Promise<Result> {
  const tenantId = TENANTS[index % TENANTS.length];

  const start = performance.now();

  try {
    const response = await fetch(`${BASE_URL}/api/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: CODE,
        tenantId,
      }),
    });

    const latency = performance.now() - start;

    return {
      latency,
      success: response.ok,
      status: response.status,
    };
  } catch {
    const latency = performance.now() - start;

    return {
      latency,
      success: false,
      status: 0,
    };
  }
}
async function runBatch(
  requests: number,
  concurrency: number,
): Promise<Result[]> {
  const results: Result[] = [];

  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;

      if (index >= requests) {
        return;
      }

      const result = await sendRequest(index);
      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, requests) },
    () => worker(),
  );

  await Promise.all(workers);

  return results;
}

function printResults(
  name: string,
  results: Result[],
  duration: number,
): void {
  const latencies = results.map((r) => r.latency);

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  const throughput =
    results.length / (duration / 1000);

  const statusCounts = new Map<number, number>();

  for (const result of results) {
    statusCounts.set(
      result.status,
      (statusCounts.get(result.status) ?? 0) + 1,
    );
  }

  console.log("\n========================================");
  console.log(name);
  console.log("========================================");

  console.log(`Requests:        ${results.length}`);
  console.log(`Successful:      ${successful.length}`);
  console.log(`Failed:          ${failed.length}`);

  console.log(`Duration:        ${duration.toFixed(2)} ms`);
  console.log(`Throughput:      ${throughput.toFixed(2)} req/s`);

  console.log("----------------------------------------");

  console.log(
    `Min:             ${Math.min(...latencies).toFixed(2)} ms`,
  );

  console.log(
    `Mean:            ${mean(latencies).toFixed(2)} ms`,
  );

  console.log(
    `P50:             ${percentile(latencies, 50).toFixed(2)} ms`,
  );

  console.log(
    `P95:             ${percentile(latencies, 95).toFixed(2)} ms`,
  );

  console.log(
    `P99:             ${percentile(latencies, 99).toFixed(2)} ms`,
  );

  console.log(
    `P99.9:           ${percentile(latencies, 99.9).toFixed(2)} ms`,
  );

  console.log(
    `Max:             ${Math.max(...latencies).toFixed(2)} ms`,
  );

  console.log("----------------------------------------");

  console.log("HTTP Statuses:");

  for (const [status, count] of statusCounts) {
    console.log(`  ${status}: ${count}`);
  }
}

async function healthCheck(): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error(
      `Health check failed: HTTP ${response.status}`,
    );
  }
}

async function main(): Promise<void> {
  console.log("========================================");
  console.log("SLER PRODUCTION BENCHMARK");
  console.log("========================================");

  console.log(`Target:            ${BASE_URL}`);
  console.log(`Total requests:    ${TOTAL_REQUESTS}`);
  console.log(`Concurrency:       ${CONCURRENCY}`);
  console.log(`Warmup requests:   ${WARMUP_REQUESTS}`);
  console.log(`Tenants:           ${TENANTS.length}`);

  console.log("\nChecking server...");

  await healthCheck();

  console.log("Health check: OK");

  // --------------------------------------------------
  // Warmup
  // --------------------------------------------------

  console.log("\nRunning warmup...");

  await runBatch(
    WARMUP_REQUESTS,
    CONCURRENCY,
  );

  console.log("Warmup complete.");

  // Give the runtime a moment to settle.
  await new Promise((resolve) =>
    setTimeout(resolve, 1000),
  );

  // --------------------------------------------------
  // Benchmark
  // --------------------------------------------------

  console.log("\nRunning benchmark...");

  const start = performance.now();

  const results = await runBatch(
    TOTAL_REQUESTS,
    CONCURRENCY,
  );

  const duration = performance.now() - start;

  printResults(
    "HTTP LATENCY",
    results,
    duration,
  );

  // --------------------------------------------------
  // Validation
  // --------------------------------------------------

  if (results.length !== TOTAL_REQUESTS) {
    throw new Error(
      `Expected ${TOTAL_REQUESTS} results, got ${results.length}`,
    );
  }

  console.log("\n========================================");
  console.log("BENCHMARK COMPLETE");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nBenchmark failed:");
  console.error(error);

  process.exit(1);
});
