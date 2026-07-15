import Redis from "ioredis";
import logger from "../utils/logger.js";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  connectTimeout: 5000,
  commandTimeout: 3000,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 100, 3000);
  },
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("ready",   () => logger.info("Redis ready"));
redis.on("error",   (err) => {
  logger.error("Redis error", { message: err.message });
});

export default redis;