import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = 'http://localhost:3000';

const TOTAL_REQUESTS = 200;
const CONCURRENCY = 8;
const WARMUP_REQUESTS = 0;

const TENANTS = [
  'tenant-1',
  'tenant-2',
  'tenant-3',
  'tenant-4',
  'tenant-5',
  'tenant-6',
  'tenant-7',
  'tenant-8',
];

const CODE = `
  let sum = 0;
  for (let i = 0; i < 100; i++) {
    sum += i;
  }
  sum;
`;

const OUTPUT_DIR = path.join(
  process.cwd(),
  'benchmarks',
  'phase4_baseline',
  'cold',
);

interface RequestResult {
  latencyMs: number;
  status: number;
  success: boolean;
}

interface BenchmarkResult {
  timestamp: string;

  configuration: {
    totalRequests: number;
    concurrency: number;
    warmupRequests: number;
    tenantCount: number;
  };

  results: {
    success: number;
    failure: number;
    durationMs: number;
    throughputRps: number;
    minMs: number;
    meanMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    p999Ms: number;
    maxMs: number;
    statusCounts: Record<string, number>;
  };
}

async function executeRequest(
  tenantId: string,
): Promise<RequestResult> {
  const start = performance.now();

  try {
    const response = await fetch(`${BASE_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: CODE,
        tenantId,
      }),
    });

    await response.text();

    const latencyMs = performance.now() - start;

    return {
      latencyMs,
      status: response.status,
      success: response.ok,
    };
  } catch {
    const latencyMs = performance.now() - start;

    return {
      latencyMs,
      status: 0,
      success: false,
    };
  }
}

async function runRequests(
  count: number,
  concurrency: number,
): Promise<RequestResult[]> {
  const results: RequestResult[] = [];
  let nextRequest = 0;

  async function worker(): Promise<void> {
    while (true) {
      const requestIndex = nextRequest++;

      if (requestIndex >= count) {
        return;
      }

      const tenantId =
        TENANTS[requestIndex % TENANTS.length]!;

      const result = await executeRequest(tenantId);

      results.push(result);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, count) },
    () => worker(),
  );

  await Promise.all(workers);

  return results;
}

function percentile(
  sortedValues: number[],
  percentileValue: number,
): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index =
    (percentileValue / 100) * (sortedValues.length - 1);

  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower]!;
  }

  const lowerValue = sortedValues[lower]!;
  const upperValue = sortedValues[upper]!;

  const weight = index - lower;

  return (
    lowerValue +
    (upperValue - lowerValue) * weight
  );
}

async function getNextRunNumber(): Promise<number> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const files = await fs.readdir(OUTPUT_DIR);

  const runNumbers = files
    .map((file) => {
      const match = file.match(/^run_(\d+)\.json$/);

      return match ? Number(match[1]) : null;
    })
    .filter(
      (value): value is number =>
        value !== null,
    );

  return runNumbers.length === 0
    ? 1
    : Math.max(...runNumbers) + 1;
}

async function saveResults(
  benchmarkResult: BenchmarkResult,
  metricsText: string,
): Promise<void> {
  const runNumber = await getNextRunNumber();

  const resultPath = path.join(
    OUTPUT_DIR,
    `run_${runNumber}.json`,
  );

  const metricsPath = path.join(
    OUTPUT_DIR,
    `run_${runNumber}_metrics.txt`,
  );

  await fs.writeFile(
    resultPath,
    JSON.stringify(benchmarkResult, null, 2),
    'utf-8',
  );

  await fs.writeFile(
    metricsPath,
    metricsText,
    'utf-8',
  );

  console.log('');
  console.log(`Results saved to ${resultPath}`);
  console.log(`Metrics saved to ${metricsPath}`);
}

async function main(): Promise<void> {
  console.log('Checking server...');

  const healthResponse = await fetch(
    `${BASE_URL}/api/health`,
  );

  if (!healthResponse.ok) {
    throw new Error(
      `Server health check failed: ${healthResponse.status}`,
    );
  }

  console.log('Server is healthy.');

  if (WARMUP_REQUESTS > 0) {
  console.log('');
  console.log(
    `Warming up with ${WARMUP_REQUESTS} requests...`,
  );

  await runRequests(
    WARMUP_REQUESTS,
    CONCURRENCY,
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 1000),
  );
}

  console.log('');
  console.log('Starting benchmark...');
  console.log(`Requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Tenants: ${TENANTS.length}`);

  const start = performance.now();

  const results = await runRequests(
    TOTAL_REQUESTS,
    CONCURRENCY,
  );

  const durationMs = performance.now() - start;

  const latencies = results
    .map((result) => result.latencyMs)
    .sort((a, b) => a - b);

  const success = results.filter(
    (result) => result.success,
  ).length;

  const failure = results.length - success;

  const throughputRps =
    TOTAL_REQUESTS / (durationMs / 1000);

  const totalLatency = latencies.reduce(
    (sum, latency) => sum + latency,
    0,
  );

  const meanMs =
    latencies.length === 0
      ? 0
      : totalLatency / latencies.length;

  const minMs =
    latencies.length === 0
      ? 0
      : latencies[0]!;

  const maxMs =
    latencies.length === 0
      ? 0
      : latencies[latencies.length - 1]!;

  const p50Ms = percentile(latencies, 50);
  const p95Ms = percentile(latencies, 95);
  const p99Ms = percentile(latencies, 99);
  const p999Ms = percentile(latencies, 99.9);

  const statusCounts: Record<string, number> = {};

  for (const result of results) {
    const status = String(result.status);

    statusCounts[status] =
      (statusCounts[status] ?? 0) + 1;
  }

  const benchmarkResult: BenchmarkResult = {
    timestamp: new Date().toISOString(),

    configuration: {
      totalRequests: TOTAL_REQUESTS,
      concurrency: CONCURRENCY,
      warmupRequests: WARMUP_REQUESTS,
      tenantCount: TENANTS.length,
    },

    results: {
      success,
      failure,
      durationMs,
      throughputRps,
      minMs,
      meanMs,
      p50Ms,
      p95Ms,
      p99Ms,
      p999Ms,
      maxMs,
      statusCounts,
    },
  };

  console.log('');
  console.log('========== Benchmark Results ==========');
  console.log(`Requests:    ${TOTAL_REQUESTS}`);
  console.log(`Success:     ${success}`);
  console.log(`Failure:     ${failure}`);
  console.log(`Duration:    ${durationMs.toFixed(2)} ms`);
  console.log(
    `Throughput:  ${throughputRps.toFixed(2)} req/s`,
  );
  console.log(`Min:         ${minMs.toFixed(2)} ms`);
  console.log(`Mean:        ${meanMs.toFixed(2)} ms`);
  console.log(`P50:         ${p50Ms.toFixed(2)} ms`);
  console.log(`P95:         ${p95Ms.toFixed(2)} ms`);
  console.log(`P99:         ${p99Ms.toFixed(2)} ms`);
  console.log(`P99.9:       ${p999Ms.toFixed(2)} ms`);
  console.log(`Max:         ${maxMs.toFixed(2)} ms`);

  console.log('');
  console.log('Status counts:');

  for (const [status, count] of Object.entries(
    statusCounts,
  )) {
    console.log(`  ${status}: ${count}`);
  }

  const metricsResponse = await fetch(
    `${BASE_URL}/api/metrics`,
  );

  if (!metricsResponse.ok) {
    throw new Error(
      `Metrics request failed: ${metricsResponse.status}`,
    );
  }

  const metricsText = await metricsResponse.text();

  await saveResults(
    benchmarkResult,
    metricsText,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
