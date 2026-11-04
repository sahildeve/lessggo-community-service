import crypto from "node:crypto";

// Only the gateway may call this service (COMM-05). The gateway sends
// x-gateway-secret on every proxied request; direct *.run.app calls do not
// have it, so they cannot skip the gateway's rate limits and checks.
const expected = process.env.GATEWAY_SHARED_SECRET;

if (process.env.NODE_ENV === "production" && !expected) {
  throw new Error("GATEWAY_SHARED_SECRET must be set in production");
}

const isFromGateway = (req) => {
  const provided = req.headers["x-gateway-secret"];
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const gatewayOnly = (req, res, next) => {
  // Local development without a secret: allow, so the service can run alone.
  if (!expected) return next();
  if (isFromGateway(req)) return next();
  return res.status(403).json({ success: false, message: "Forbidden" });
};
