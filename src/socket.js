import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import redis from "./config/redis.js";
import logger from "./utils/logger.js";

const initSocket = (httpServer) => {
  const io = new Server(httpServer);

  try {
    // Adapter clients sirf inter-instance broadcasting ke liye hain — koi user request
    // inpe wait nahi karti, isliye main client wala "fail fast" config yahan galat hai:
    //  - commandTimeout: undefined — SUBSCRIBE/PSUBSCRIBE long-lived hain; inherited
    //    5000ms timeout slow connect pe unhe reject karta hai → Unhandled Rejection, aur
    //    instance dusre instances ke broadcasts receive karna band kar deta hai.
    //    (0 mat daalna — ioredis 0ms ka timeout laga dega)
    //  - maxRetriesPerRequest: null — adapter publish() bina .catch ke karta hai; Redis
    //    outage me retry limit hit hone par rejection handled error nahi, Unhandled
    //    Rejection banta hai. null = reconnect tak queue me rakho
    // Main client (config/redis.js) ka commandTimeout/maxRetriesPerRequest sahi hai — mat badlo
    const pubClient = redis.duplicate({
      commandTimeout: undefined,
      maxRetriesPerRequest: null,
    });
    const subClient = redis.duplicate({
      commandTimeout: undefined,
      maxRetriesPerRequest: null,
    });

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