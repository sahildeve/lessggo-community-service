import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "./config/redis.js";
import logger from "./utils/logger.js";

const initSocket = (httpServer) => {
  const io = new Server(httpServer);

  try {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();

    // ── ZAROORI: Duplicate clients par error listener lagana must hai ──
    pubClient.on("error", (err) => {
      logger.error("Redis PubClient error:", { message: err.message });
    });
    subClient.on("error", (err) => {
      logger.error("Redis SubClient error:", { message: err.message });
    });

    io.adapter(createAdapter(pubClient, subClient));
    logger.info("Community Socket.io Redis adapter connected");
  } catch (err) {
    logger.error("Community Redis adapter error:", { message: err.message });
  }

  return io;
};

export default initSocket;