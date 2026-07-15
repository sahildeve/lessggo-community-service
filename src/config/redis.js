import Redis from "ioredis";
import logger from "../utils/logger.js";

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,

  tls: {},

  retryStrategy(times) {
    return Math.min(times * 100, 3000);
  },
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("ready", () => logger.info("Redis ready"));
redis.on("error", (err) => logger.error(err.message));

export default redis;