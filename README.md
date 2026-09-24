# Sler

**Sler** is a multi-tenant JavaScript execution sandbox built on [isolated-vm](https://github.com/laverdet/isolated-vm). It provides secure, isolated code execution with per-tenant resource limits, fair scheduling, circuit breaking, and Prometheus metrics.

## Features

- **Strong Isolation**: Each execution runs in a dedicated V8 isolate with 128MB memory limit and 1s CPU timeout
- **Multi-Tenant Architecture**: Per-tenant queues, concurrency limits, and circuit breakers
- **Fair Scheduling**: Round-robin scheduler prevents noisy neighbors from starving other tenants
- **Backpressure & Circuit Breaking**: Automatic rejection when queues fill or failure rates spike
- **Observability**: Prometheus metrics for queue wait, execution time, isolate creation, and script execution
- **Worker Pool**: Fixed pool of Node.js worker threads for parallel execution

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  HTTP API   │────▶│   Manager   │────▶│  Worker Pool    │
│  (Express)  │     │  (Scheduler,│     │  (isolated-vm)  │
└─────────────┘     │ Tenant Mgr, │     └─────────────────┘
                    │ Circuit Brk)│            ▲
                    └─────────────┘            │
                           │                   │
                    ┌──────┴──────┐    ┌───────┴───────┐
                    │  Metrics    │    │  Scheduler    │
                    │ (Prometheus)│    │ (Round-Robin) │
                    └─────────────┘    └───────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **API Routes** | HTTP endpoints for `/execute`, `/health`, `/metrics` |
| **Manager** | Coordinates workers, dispatches jobs, tracks pending work |
| **Scheduler** | Round-robin queue across tenants; skips ineligible tenants |
| **TenantManager** | Enforces per-tenant concurrency (4) and queue depth (500) |
| **CircuitBreaker** | Trips after 5 consecutive failures; 60s cooldown; half-open trial |
| **Worker** | Runs `isolated-vm` isolates; reports results via `parentPort` |
| **Metrics** | Prometheus histograms for wait, execution, isolate creation, script time |

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Installation

```bash
npm install
npm run build
```

### Running the Server

```bash
npm run dev
```

Server starts on `http://localhost:3000`.

### Executing Code

```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "1 + 2 * 3", "tenantId": "my-tenant"}'
```

Response:
```json
{"result": 7}
```

### Health Check

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

### Prometheus Metrics

```bash
curl http://localhost:3000/api/metrics
```

## API Reference

### `POST /api/execute`

Execute JavaScript code in an isolated sandbox.

**Request Body**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | JavaScript code to execute |
| `tenantId` | string | Yes | Tenant identifier for isolation and limits |

**Responses**

| Status | Description |
|--------|-------------|
| `200` | Success – `{ "result": <value> }` |
| `400` | Invalid request – missing or empty `code`/`tenantId` |
| `429` | Queue full – tenant exceeded queue depth (500) |
| `500` | Execution error – code threw or timed out |
| `503` | Circuit open – tenant exceeded failure threshold |

**Example: Timeout**
```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "while(true) {}", "tenantId": "test"}'
# {"error":"Script execution timed out"}
```

**Example: Memory Limit**
```bash
curl -X POST http://localhost:3000/api/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "const a=[]; while(true) a.push(new Array(1e6).fill(\"x\"))", "tenantId": "test"}'
# {"error":"isolate disposed"}
```

### `GET /api/health`

Returns `{ "status": "ok" }` if server is running.

### `GET /api/metrics`

Returns Prometheus-format metrics.

## Configuration

All limits are constants in the source. To customize, modify and rebuild:

| Constant | File | Default |
|----------|------|---------|
| Worker pool size | `src/api/routes.ts` | 8 |
| Memory limit per isolate | `src/runtime/isolate.ts` | 128 MB |
| Script timeout | `src/runtime/isolate.ts` | 1000 ms |
| Max concurrent per tenant | `src/runtime/tenant-manager.ts` | 4 |
| Max queue depth per tenant | `src/runtime/tenant-manager.ts` | 500 |
| Circuit breaker failure threshold | `src/runtime/circuit-breaker.ts` | 5 |
| Circuit breaker cooldown | `src/runtime/circuit-breaker.ts` | 60,000 ms |
| Half-open trial window | `src/runtime/circuit-breaker.ts` | 10,000 ms |

## Testing

Run the integration test suite (requires running server):

```bash
npm run dev &
node --test tests/*.test.ts
```

### Test Phases

| Phase | Focus | Tests |
|-------|-------|-------|
| **Phase 1** | Isolation boundaries | Basic eval, sandbox escape, timeout, OOM |
| **Phase 2** | Fair scheduling | Noisy neighbor doesn't starve quiet tenant |
| **Phase 3** | Limits & backpressure | Circuit breaker, queue depth, per-tenant concurrency, fairness under load |

## Benchmarks

Two benchmark scripts are included:

```bash
# Warm benchmark (1000 requests, 100 warmup)
npm run benchmark

# Cold benchmark (200 requests, no warmup)
npm run benchmark:cold
```

Results are saved to `benchmarks/phase4_baseline/{warm,cold}/run_N.json`.

## Project Structure

```
src/
├── api/
│   ├── routes.ts     # HTTP route handlers
│   └── server.ts     # Express server setup
├── metrics/
│   └── index.ts      # Prometheus metrics
├── runtime/
│   ├── circuit-breaker.ts  # Circuit breaker state machine
│   ├── errors.ts           # Custom error classes
│   ├── isolate.ts          # isolated-vm execution
│   ├── manager.ts          # Worker pool & job dispatch
│   ├── scheduler.ts        # Round-robin tenant scheduler
│   ├── tenant-manager.ts   # Per-tenant limits & circuit breaker
│   └── worker.ts           # Worker thread entry point
└── types/
    └── index.ts      # TypeScript interfaces
```

## Design Decisions

- **No `node:vm`**: Uses `isolated-vm` for true process-level isolation (separate V8 heap, no access to Node.js built-ins)
- **Worker threads**: Fixed pool avoids isolate creation overhead per request; isolates are created per-execution inside workers
- **Round-robin scheduling**: Simple, starvation-free, works well with per-tenant concurrency limits
- **Circuit breaker at admission**: Checked before queueing to fail fast and protect workers
- **Metrics at job boundaries**: Records wait time, execution time, isolate creation, and script execution separately

## License

ISC