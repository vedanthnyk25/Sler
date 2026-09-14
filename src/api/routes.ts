import type { Request, Response } from "express";
import { Router } from "express";
import { Manager } from "../runtime/manager.js";

export const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const manager = new Manager(4); 

router.post("/execute", handleExecution);

async function handleExecution(req: Request, res: Response) {
  const { code, tenantId } = req.body;
  if(tenantId === undefined || typeof tenantId !== "string" || tenantId.trim() === "") {
    return res.status(400).json({ error: "Invalid tenantId" });
  }

  try {
    const result = await manager.enqueue(code, tenantId);
    res.json({ result });
  }
  catch(error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
