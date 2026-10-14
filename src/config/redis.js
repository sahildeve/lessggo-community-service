import Redis from "ioredis";
import logger from "../utils/logger.js";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 10000,
  retryStrategy(times) {
    return Math.min(times * 200, 3000);
  },
});

redis.on("connect", () => logger.info("Community Redis connected"));
redis.on("ready", () => logger.info("Community Redis ready"));
redis.on("error", (err) => {
  logger.error("Community Redis error", { message: err.message });
});

export default redis;
