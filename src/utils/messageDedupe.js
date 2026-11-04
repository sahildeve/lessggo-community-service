import redis from "../config/redis.js";
import logger from "./logger.js";

// ─── Pub/Sub message dedupe
// Pub/Sub delivers at least once, so the same message can arrive twice.
// Each message id gets a Redis key with one of two states:
//   "in_progress" (short TTL) - someone is handling it right now
//   "done" (24h)              - it was handled successfully
//
// COMM-09: a redelivered message whose key is still "in_progress" must be
// NACKED (retried later), never acked. Acking it lost messages whenever an
// instance died mid-handling (deploy, scale-down, crash).
//
// NOTE: identical copy in every service (separate deployables).
// When you change it, update all copies.

const IN_PROGRESS_TTL_SECONDS = 60; // ~ack deadline: a dead worker's claim clears soon
const PROCESSED_TTL_SECONDS = 86400; // 24 hours

// Some services' redis clients queue commands forever while Redis is down,
// so use our own timeout or the whole subscriber would hang.
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

/**
 * Claims a message before handling it.
 * Returns "new" (handle it), "done" (real duplicate: ack and skip) or
 * "in_progress" (another worker has it, or one died: nack so it retries later).
 * If Redis fails, returns "new" so messages are never dropped.
 */
export const claimMessage = async (messageId, context) => {
  if (!messageId) return "new";
  const key = keyFor(messageId, context);

  try {
    const claimed = await withTimeout(
      redis.set(key, "in_progress", "EX", IN_PROGRESS_TTL_SECONDS, "NX"),
    );
    if (claimed === "OK") return "new";

    const state = await withTimeout(redis.get(key));
    // "1" is the value the old code wrote for finished messages.
    if (state === "done" || state === "1") return "done";
    return "in_progress";
  } catch (err) {
    logger.warn(`[${context}] Dedupe check failed, processing without dedupe`, {
      messageId,
      errorMessage: err.message,
    });
    return "new";
  }
};

// Handler succeeded: remember it for 24h.
export const markProcessed = async (messageId, context) => {
  if (!messageId) return;

  try {
    await withTimeout(
      redis.set(
        keyFor(messageId, context),
        "done",
        "EX",
        PROCESSED_TTL_SECONDS,
      ),
    );
  } catch (err) {
    logger.warn(`[${context}] Failed to mark message processed`, {
      messageId,
      errorMessage: err.message,
    });
  }
};

// Handler failed: drop the claim so the retry runs right away.
export const releaseProcessed = async (messageId, context) => {
  if (!messageId) return;

  try {
    await withTimeout(redis.del(keyFor(messageId, context)));
  } catch (err) {
    logger.warn(
      `[${context}] Failed to release dedupe key, retry may wait for it to expire`,
      { messageId, errorMessage: err.message },
    );
  }
};
