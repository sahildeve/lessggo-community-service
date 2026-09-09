import axios from "axios";
import redis from "../config/redis.js";
import logger from "./logger.js";

const baseURL = process.env.AUTH_SERVICE_URL || "http://localhost:8080";
const CACHE_TTL = 600; // 10 min

const client = axios.create({ baseURL, timeout: 5000 });

// ─── userIds → { userId: { username, fullName, profilePicture } }
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

  // ── Baaki auth service se
  try {
    const { data } = await client.post("/api/auth/internal/users", {
      userIds: missing,
    });

    for (const user of data?.data?.users || []) {
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

      redis
        .set(`user_info:${user.userId}`, JSON.stringify(info), "EX", CACHE_TTL)
        .catch(() => {});
    }
  } catch (err) {
    // ── Auth down ho to bhi chat list chalti rahe
    logger.warn("Failed to fetch users from auth service:", err.message);
  }

  return result;
};
