import "dotenv/config";
import express from "express";
import logger from "./src/utils/logger.js";
import helmet from "helmet";
import morgan from "morgan";
import directChatRoutes from "./src/routes/directChat.routes.js";
import communityRoutes from "./src/routes/community.routes.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./src/config/swagger.js";
import { gatewayOnly } from "./src/middlewares/gatewayOnly.js";
import mongoose from "mongoose";
import redis from "./src/config/redis.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());

// ─── Readiness (COMM-27): checks MongoDB and Redis, for monitoring and alerts.
// /health stays dependency-free so a short blip never restarts every instance.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);

app.get("/ready", async (_req, res) => {
  const [mongo, cache] = await Promise.allSettled([
    // Wrapped so "not connected yet" (db undefined) counts as down, not a crash.
    withTimeout((async () => mongoose.connection.db.admin().ping())(), 2000),
    withTimeout(redis.ping(), 2000),
  ]);
  const checks = {
    mongo: mongo.status === "fulfilled" ? "ok" : "down",
    redis: cache.status === "fulfilled" ? "ok" : "down",
  };
  const ready = checks.mongo === "ok" && checks.redis === "ok";
  res
    .status(ready ? 200 : 503)
    .json({ status: ready ? "READY" : "NOT_READY", ...checks });
});

// ─── Health Check (open for Cloud Run and monitoring) ───────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "community-service" });
});

// ─── Only the gateway may call the API (COMM-05) ───────
// No CORS here: browsers reach this service only through the gateway,
// which handles CORS and preflight requests.
app.use(gatewayOnly);

app.use(express.json({ limit: "10kb" }));
// Express 5 leaves req.body undefined when no body is sent (COMM-15).
app.use((req, _res, next) => {
  req.body ??= {};
  next();
});
// Cloud Run already logs every request in production; morgan only locally (COMM-26).
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// ─── Routes ───────────
app.use("/api/direct-chat", directChatRoutes);
app.use("/api/community", communityRoutes);

// API docs only outside production (COMM-05).
if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}


// ─── 404 for unknown routes (JSON, not Express's HTML page)
app.use((_req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// ─── Global Error Handler (COMM-25): real message only for client errors
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error("Unhandled error", { message: err.message, stack: err.stack });
  }
  res.status(status).json({
    success: false,
    message:
      status < 500 ? err.message : "Something went wrong. Please try again.",
  });
});

export default app;
