import "dotenv/config";
import http from "http";
import app from "./app.js";
import connectDB from "./src/config/db.js";
import initSocket from "./src/socket.js";
import logger from "./src/utils/logger.js";
const PORT = process.env.PORT || 3004;
const start = async () => {
  try {
    await connectDB();
    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);
    app.set("io", io);  
    httpServer.listen(PORT, () => {
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      logger.info(`  Community Service running on port ${PORT}`);
      logger.info(`  Mode : ${process.env.NODE_ENV}`);
      logger.info(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    });
  } catch (err) {
    logger.error("Server startup error:", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};
start();
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:", err.message);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err.message);
  process.exit(1);
});