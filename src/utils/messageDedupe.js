import redis from "../config/redis.js";
import logger from "./logger.js";

// ─── Pub/Sub message dedupe
// Pub/Sub at-least-once deliver karta hai — same message dobara aa sakta hai.
// Message id ko Redis me atomically claim karo (SET NX EX); dobara aaye toh skip.
// Redis down ho toh dedupe ke bina process karo (purana behaviour) — drop nahi.
//
// Two-stage claim:
//   alreadyProcessed → 5 min "in progress" claim (process beech me mar gaya —
//                      e.g. Cloud Run scale-down — toh 5 min baad retry ho sakta hai)
//   markProcessed    → success ke baad 24h tak extend
//   releaseProcessed → fail hua toh claim turant hata do
//
// NOTE: Ye file har service me identical copy hai (separate deployables).
// Change karo toh saari copies update karna.

const IN_PROGRESS_TTL_SECONDS = 300; // 5 minutes
const PROCESSED_TTL_SECONDS = 86400; // 24 hours

// Kuch services ka redis client (maxRetriesPerRequest: null) Redis down hone par
// command ko forever queue me rakhta hai — throw nahi karta, bas wait karta hai.
// Isliye apna timeout, warna poora subscriber atak jayega.
const REDIS_TIMEOUT_MS = 2000;

const keyFor = (messageId, context) => `processed_msg:${context}:${messageId}`;

const withTimeout = (promise) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Redis timed out after ${REDIS_TIMEOUT_MS}ms`)),
      REDIS_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// true → pehle se claimed (duplicate, skip karo); false → abhi claim kiya, process karo
export const alreadyProcessed = async (messageId, context) => {
  // Bina id ke saare messages ek hi key pe collide karenge — dedupe mat karo
  if (!messageId) return false;

  try {
    const result = await withTimeout(
      redis.set(
        keyFor(messageId, context),
        "1",
        "EX",
        IN_PROGRESS_TTL_SECONDS,
        "NX",
      ),
    );
    // "OK" → humne claim kiya; null → key pehle se thi
    return result === null;
  } catch (err) {
    logger.warn(`[${context}] Dedupe check failed, processing without dedupe`, {
      messageId,
      errorMessage: err.message,
    });
    return false;
  }
};

// Handler successful — claim ko 24h tak extend karo. XX: key hai tabhi, warna kuch nahi
export const markProcessed = async (messageId, context) => {
  if (!messageId) return;

  try {
    await withTimeout(
      redis.set(
        keyFor(messageId, context),
        "1",
        "EX",
        PROCESSED_TTL_SECONDS,
        "XX",
      ),
    );
  } catch (err) {
    logger.warn(
      `[${context}] Failed to mark message processed, dedupe window stays 5 min`,
      { messageId, errorMessage: err.message },
    );
  }
};

// Handler fail hua — claim hata do taaki retry dobara run ho sake
export const releaseProcessed = async (messageId, context) => {
  if (!messageId) return;

  try {
    await withTimeout(redis.del(keyFor(messageId, context)));
  } catch (err) {
    logger.warn(
      `[${context}] Failed to release dedupe key, retry may be skipped as duplicate`,
      { messageId, errorMessage: err.message },
    );
  }
};
