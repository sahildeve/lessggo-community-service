// Loaded with `node --import ./instrument.js server.js` so Sentry starts
// before any other module (required for ESM in @sentry/node).
import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
        // Lets errors be filtered per service even when projects share a DSN.
    initialScope: { tags: { service: "community-service" } },
    // Never send tokens, internal keys or request bodies (chat text, names).
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
          delete event.request.headers["x-internal-key"];
          delete event.request.headers["x-gateway-secret"];
        }
      }
      return event;
    },
  });
}
