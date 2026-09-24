import client from 'prom-client';

export class Metrics {
  private readonly register: client.Registry;

  // Existing job-level metrics
  private readonly jobWaitTime: client.Histogram<string>;
  private readonly jobExecutionTime: client.Histogram<string>;
  private readonly jobTotalTime: client.Histogram<string>;
  private readonly jobsTotal: client.Counter<string>;

  // Phase 4 diagnostic metrics
  private readonly isolateCreationTime: client.Histogram<string>;
  private readonly scriptExecutionTime: client.Histogram<string>;

  constructor() {
    this.register = new client.Registry();

    this.jobWaitTime = new client.Histogram({
      name: 'sler_job_wait_time_ms',
      help: 'Time a job spends waiting in the scheduler queue',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobExecutionTime = new client.Histogram({
      name: 'sler_job_execution_time_ms',
      help: 'Time spent executing a job in a worker',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobTotalTime = new client.Histogram({
      name: 'sler_job_total_time_ms',
      help: 'Total time from job enqueue to completion',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.register],
    });

    this.jobsTotal = new client.Counter({
      name: 'sler_jobs_total',
      help: 'Total number of completed jobs',
      labelNames: ['status'],
      registers: [this.register],
    });

    // ------------------------------------------------------------
    // Phase 4 diagnostic metrics
    //
    // These use finer-grained buckets because isolate creation
    // and script execution are expected to be much smaller than
    // the overall HTTP/job latency.
    // ------------------------------------------------------------

    this.isolateCreationTime = new client.Histogram({
      name: 'sler_isolate_create_time_ms',
      help: 'Time spent creating an isolated-vm isolate and context',
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.register],
    });

    this.scriptExecutionTime = new client.Histogram({
      name: 'sler_script_execution_time_ms',
      help: 'Time spent executing JavaScript inside the isolate',
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.register],
    });
  }

  // ------------------------------------------------------------
  // Existing metric recording
  // ------------------------------------------------------------

  recordQueueWait(durationMs: number): void {
    this.jobWaitTime.observe(durationMs);
  }

  recordExecutionTime(durationMs: number): void {
    this.jobExecutionTime.observe(durationMs);
  }

  recordTotalTime(durationMs: number): void {
    this.jobTotalTime.observe(durationMs);
  }

  recordSuccess(): void {
    this.jobsTotal.inc({ status: 'success' });
  }

  recordFailure(): void {
    this.jobsTotal.inc({ status: 'failure' });
  }

  // ------------------------------------------------------------
  // Phase 4 diagnostic metric recording
  // ------------------------------------------------------------

  recordIsolateCreationTime(durationMs: number): void {
    this.isolateCreationTime.observe(durationMs);
  }

  recordScriptExecutionTime(durationMs: number): void {
    this.scriptExecutionTime.observe(durationMs);
  }

  // ------------------------------------------------------------
  // Prometheus output
  // ------------------------------------------------------------

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }
}
