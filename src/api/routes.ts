import type { Request, Response } from 'express';
import { Router } from 'express';
import { Manager } from '../runtime/manager.js';
import {Metrics} from '../metrics/index.js';

export const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const metrics = new Metrics();
const manager = new Manager(8, metrics);

router.post('/execute', handleExecution);

async function handleExecution(req: Request, res: Response) {
  const { code, tenantId } = req.body;
  if (
    tenantId === undefined ||
    typeof tenantId !== 'string' ||
    tenantId.trim() === ''
  ) {
    return res.status(400).json({ error: 'Invalid tenantId' });
  }

  if (code === undefined || typeof code !== 'string' || code.trim() === '') {
    return res.status(400).json({ error: 'Invalid code' });
  }

  try {
    const result = await manager.enqueue(code, tenantId);
    res.json({ result });
  } catch (error) {
    if (error instanceof Error && error.name === 'QueueFullError') {
      return res.status(429).json({ error: error.message });
    }

    if (error instanceof Error && error.name === 'CircuitOpenError') {
      return res.status(503).json({ error: error.message });
    }

    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
}

router.get('/metrics', async (req, res) => {
  try {
    const metricsData = await metrics.getMetrics();
    res.set('Content-Type', 'text/plain');
    res.send(metricsData);
  } catch (error) {
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : String(error) });
  }
});
