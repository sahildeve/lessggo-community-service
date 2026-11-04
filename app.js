import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import directChatRoutes from "./src/routes/directChat.routes.js";
import communityRoutes from "./src/routes/community.routes.js";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./src/config/swagger.js";
import notificationRoutes from "./src/routes/notification.routes.js";
import { gatewayOnly } from "./src/middlewares/gatewayOnly.js";

const app = express();

app.set("trust proxy", 1);
app.use(helmet());

// ─── Health Check (open for Cloud Run and monitoring) ───────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "community-service" });
});

// ─── Only the gateway may call the API (COMM-05) ───────
// No CORS here: browsers reach this service only through the gateway,
// which handles CORS and preflight requests.
app.use(gatewayOnly);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// ─── Routes ───────────
app.use("/api/direct-chat", directChatRoutes);
app.use("/api/community", communityRoutes);

// API docs only outside production (COMM-05).
if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}

app.use("/api/community/notifications", notificationRoutes);

// ─── Global Error Handler
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

export default app;
