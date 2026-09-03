#!/usr/bin/env node
import { startWorkerServer, DEFAULT_WORKER_PORT } from "../src/worker/workerServer.ts";

const port = process.env.AUTOCAP_WORKER_PORT
  ? parseInt(process.env.AUTOCAP_WORKER_PORT, 10)
  : DEFAULT_WORKER_PORT;

startWorkerServer(port)
  .then(({ port }) => {
    console.log(`[AutoCap] Local Media Worker running on http://127.0.0.1:${port}`);
    console.log(`[AutoCap] Ready to accept media jobs via SSE.`);
  })
  .catch((err) => {
    console.error(`[AutoCap] Failed to start Local Media Worker:`, err);
    process.exit(1);
  });

