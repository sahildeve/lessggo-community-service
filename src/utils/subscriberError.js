// ─── Pub/Sub subscriber error handling
// Permanent errors (bad input, missing record, coding bug) retry par kabhi succeed
// nahi honge — aur dead-letter policy nahi hai, toh nack karne se forever loop.
// Unhe ack karke drop karo (warn log ke saath). Baaki sab nack — Pub/Sub retry karega.
//
// NOTE: Ye file har service me identical copy hai (separate deployables).
// Change karo toh saari copies update karna.

// 4xx hote hue bhi retry-worthy: timeout aur rate limit (e.g. axios se internal calls)
const RETRYABLE_4XX = new Set([408, 429]);

const PERMANENT_ERROR_NAMES = new Set([
  "CastError", // malformed ObjectId
  "ValidationError", // Mongoose schema validation
  "ReferenceError", // coding bug
  "TypeError", // coding bug / missing payload fields
  "SyntaxError", // malformed JSON message body
]);

const CODING_BUG_NAMES = new Set(["ReferenceError", "TypeError"]);

const isPermanentError = (err) => {
  if (!err) return false;

  // Numeric status ho toh wahi decide karega (4xx permanent, 5xx transient)
  if (typeof err.status === "number") {
    return (
      err.status >= 400 && err.status < 500 && !RETRYABLE_4XX.has(err.status)
    );
  }

  return PERMANENT_ERROR_NAMES.has(err.name);
};

// Body malformed ho toh eventType milega hi nahi — null report karo
const readEventType = (message) => {
  try {
    return JSON.parse(message.data.toString())?.eventType ?? null;
  } catch {
    return null;
  }
};

export const handleSubscriberError = (message, err, logger, context) => {
  const details = {
    context,
    eventType: readEventType(message),
    messageId: message?.id ?? null,
    errorName: err?.name ?? null,
    errorMessage: err?.message ?? String(err),
    status: err?.status ?? null,
    ...(CODING_BUG_NAMES.has(err?.name) ? { stack: err.stack } : {}),
  };

  if (isPermanentError(err)) {
    logger.warn(
      `[${context}] Dropping Pub/Sub message (permanent error, not retrying)`,
      details,
    );
    message.ack();
    return;
  }

  logger.error(
    `[${context}] Pub/Sub message failed (transient error, nacking for retry)`,
    details,
  );
  message.nack();
};
