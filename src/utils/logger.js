import winston from "winston";

const isProd = process.env.NODE_ENV === "production";

// Cloud Logging reads "severity" from JSON lines (ERROR, WARN, INFO).
const severity = winston.format((info) => {
  info.severity = info.level.toUpperCase();
  return info;
});

// Keep extra string arguments like logger.error("Login error:", err.message),
// which winston would otherwise drop silently (COMM-26).
const appendExtras = winston.format((info) => {
  const extras = info[Symbol.for("splat")];
  if (Array.isArray(extras)) {
    const parts = extras.filter(
      (x) => typeof x === "string" || typeof x === "number",
    );
    if (parts.length) info.message = `${info.message} ${parts.join(" ")}`;
  }
  return info;
});

const logger = winston.createLogger({
  level: isProd ? "info" : "debug",
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    appendExtras(),
    winston.format.timestamp(),
  ),
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.combine(severity(), winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
    }),
  ],
});

export default logger;
