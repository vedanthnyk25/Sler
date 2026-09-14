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
  const { code } = req.body;  

  try {
    const result = await manager.enqueue(code);
    res.json({ result });
  }
  catch(error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
