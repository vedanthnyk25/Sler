import { Router} from "express";
import type { Request, Response } from "express";

export const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.post("/execute", handleExecution);

function handleExecution(req: Request, res: Response) {
  const { code } = req.body;

  // Hand over the code to runtime manager for execution

  res.json({ result: "Code executed successfully" });
}
