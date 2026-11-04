import jwt from "jsonwebtoken";
import redis from "../config/redis.js";
import logger from "../utils/logger.js";
import { error } from "../utils/response.js";

// Same Redis keys auth-service writes: blacklist:<jti> on logout and
// tokens_valid_after:<userId> on password change / logout-all / deletion (COMM-03).
const isTokenRevoked = async (decoded) => {
  const [blacklisted, validAfter] = await Promise.all([
    redis.exists(`blacklist:${decoded.jti}`),
    redis.get(`tokens_valid_after:${decoded.sub}`),
  ]);
  return blacklisted === 1 || (validAfter && decoded.iat < Number(validAfter));
};

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return error(res, "No token provided", 401);
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
      issuer: "cab-auth-service",
      audience: "cab-app",
      algorithms: ["HS256"], // never accept any other signing algorithm
    });

    // A Redis problem must not lock everyone out (same policy as auth and gateway).
    try {
      if (await isTokenRevoked(decoded)) {
        return error(res, "Session expired. Please log in again.", 401);
      }
    } catch (redisErr) {
      logger.error("Token revocation check failed, allowing request", {
        message: redisErr.message,
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return error(res, "Token expired", 401);
    if (err.name === "JsonWebTokenError")
      return error(res, "Invalid token", 401);
    return error(res, "Authentication failed", 401);
  }
};
