import "dotenv/config";
import http from "http";
import mongoose from "mongoose";
import app from "./app.js";
import connectDB from "./src/config/db.js";
import redis from "./src/config/redis.js";
import initSocket from "./src/socket.js";
import logger from "./src/utils/logger.js";
import {
  startCommunitySubscriber,
  stopCommunitySubscribers,
} from "./src/workers/communitySubscriber.js";

const PORT = process.env.PORT || 3004;
let httpServer;

const start = async () => {
  try {
    await connectDB();
    httpServer = http.createServer(app);

    const io = initSocket(httpServer);
    app.set("io", io);

    startCommunitySubscriber(io);
    // auth-events topic ka USER_DELETED — alag subscription, same handler
    startCommunitySubscriber(
      io,
      process.env.USER_DELETED_SUB || "community-user-deleted-sub",
    );

    httpServer.listen(PORT, () => {
      logger.info(`Community Service running on port ${PORT}`, {
        mode: process.env.NODE_ENV,
      });
    });
  } catch (err) {
    logger.error("Server startup error", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};

start();

// ── Graceful shutdown (COMM-10) ──
// Cloud Run sends SIGTERM on deploy / scale-down and kills the instance ~10s
// later. Stop pulling messages first (unfinished ones are retried by Pub/Sub,
// see COMM-09), let in-flight HTTP requests finish, then close connections.
let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully`);

  const forceExit = setTimeout(() => process.exit(0), 9000);
  forceExit.unref();

  try {
    await stopCommunitySubscribers();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await Promise.allSettled([mongoose.connection.close(), redis.quit()]);
  } finally {
    process.exit(0);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Log only: one stray rejected promise should not kill every in-flight request.
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection", {
    message: err?.message || String(err),
    stack: err?.stack,
  });
});

// After an uncaught exception the process state is unknown: log and exit so
// Cloud Run starts a clean instance.
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception", {
    message: err?.message || String(err),
    stack: err?.stack,
  });
  process.exit(1);
});
