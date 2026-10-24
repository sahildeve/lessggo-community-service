import Redis from "ioredis";
import logger from "../utils/logger.js";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3, // command 3 try ke baad fail ho, hang na kare
  enableReadyCheck: true, // connection ready hone ke baad hi commands bheje
  connectTimeout: 10000,
  commandTimeout: 5000, // ek command max 5 second
  retryStrategy(times) {
    // HAMESHA reconnect karo, kabhi null mat karo — Redis wapas aate hi recover
    return Math.min(times * 200, 5000);
  },
});

redis.on("connect", () => logger.info("Community Redis connected"));
redis.on("ready", () => logger.info("Community Redis ready"));
redis.on("error", (err) => {
  logger.error("Community Redis error", { message: err.message });
});

export default redis;
