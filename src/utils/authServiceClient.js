import axios from "axios";
import redis from "../config/redis.js";
import logger from "./logger.js";

const baseURL = process.env.AUTH_SERVICE_URL || "http://localhost:8080";
const CACHE_TTL = 600; // 10 min

// Auth accepts at most 10 KB per request body (~350 IDs), so one big request
// used to fail silently for users in large communities (COMM-18).
const CHUNK_SIZE = 100;
const MAX_PARALLEL_REQUESTS = 3;

const client = axios.create({
  baseURL,
  timeout: 5000,
  headers: {
    "x-internal-key": process.env.INTERNAL_SERVICE_KEY, // Auth service isko verify karegi
  },
});

const fetchChunk = async (chunk) => {
  try {
    const { data } = await client.post("/api/auth/internal/users", {
      userIds: chunk,
    });
    return data?.data?.users || [];
  } catch (err) {
    // Auth down ho to bhi chat list chalti rahe (names fall back to stored ones).
    logger.warn("Failed to fetch users from auth service", {
      count: chunk.length,
      message: err.message,
    });
    return [];
  }
};

// ─── userIds → { userId: { username, fullName, profilePicture, ... } }
export const getUsersByIds = async (userIds) => {
  const ids = [...new Set(userIds.filter(Boolean).map(String))];
  if (!ids.length) return {};

  const result = {};
  const missing = [];

  // ── Cache se jo mil jaye
  try {
    const cached = await redis.mget(ids.map((id) => `user_info:${id}`));
    ids.forEach((id, i) => {
      if (cached[i]) result[id] = JSON.parse(cached[i]);
      else missing.push(id);
    });
  } catch {
    missing.push(...ids);
  }

  if (!missing.length) return result;

  // ── Baaki auth service se: 100 IDs per request, max 3 requests at a time,
  // so one screen cannot flood auth-service.
  const chunks = [];
  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    chunks.push(missing.slice(i, i + CHUNK_SIZE));
  }

  const users = [];
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL_REQUESTS) {
    const batch = await Promise.all(
      chunks.slice(i, i + MAX_PARALLEL_REQUESTS).map(fetchChunk),
    );
    batch.forEach((list) => users.push(...list));
  }

  // ── Results cache karo, ek hi Redis round trip mein
  const cacheWrites = redis.pipeline();
  for (const user of users) {
    const info = {
      username: user.username ?? null,
      fullName: user.fullName ?? null,
      profilePicture: user.profilePicture ?? null,
      age: user.age ?? null,
      gender: user.gender ?? null,
      designation: user.designation ?? null,
      interests: user.interests ?? [],
    };
    result[String(user.userId)] = info;
    cacheWrites.set(
      `user_info:${user.userId}`,
      JSON.stringify(info),
      "EX",
      CACHE_TTL,
    );
  }
  cacheWrites.exec().catch(() => {});

  return result;
};
