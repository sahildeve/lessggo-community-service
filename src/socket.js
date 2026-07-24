import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import * as directChatService from "./services/directChat.service.js";
import * as communityService from "./services/community.service.js";
import redis from "./config/redis.js";
import logger from "./utils/logger.js";

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.auth;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, {
        issuer: "cab-auth-service",
        audience: "cab-app",
      });

      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    logger.info(`User connected: ${socket.user.username}`);
    socket.join(`user:${socket.user.sub}`);

    const userId = socket.user.sub;

    // ─── Online status — try/catch mein wrap karo taaki fail hone par
    try {
      await redis.set(
        `user_status:${userId}`,
        JSON.stringify({ status: "online", lastSeenAt: null }),
      );

      const participantUserIds =
        await directChatService.getDirectChatParticipantIds(userId);

      for (const participantUserId of participantUserIds) {
        io.to(`user:${participantUserId}`).emit("user_status_changed", {
          userId,
          status: "online",
          lastSeenAt: null,
        });
      }
    } catch (err) {
      logger.error("Online status setup error:", err.message);
      // yahan crash nahi hoga — listeners neeche register hote rahenge
    }

    // ─── On-demand status check
    socket.on("get_user_status", async (targetUserId) => {
      try {
        const raw = await redis.get(`user_status:${targetUserId}`);
        const data = raw
          ? JSON.parse(raw)
          : { status: "offline", lastSeenAt: null };
        socket.emit("user_status_response", { userId: targetUserId, ...data });
      } catch (err) {
        logger.error("Get user status error:", err.message);
      }
    });

    // ════════════════════════════════════════════════════════════
    // LAYER 1 — Direct Chat (same as before)
    // ════════════════════════════════════════════════════════════

    socket.on("join_direct_chat", async (chatId) => {
      try {
        socket.join(`direct_${chatId}`);
        logger.info(`${socket.user.username} joined direct chat: ${chatId}`);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("send_direct_message", async ({ chatId, message }) => {
      try {
        if (!message?.trim()) return;
        if (message.length > 500) {
          socket.emit("error", { message: "Message too long (max 500 chars)" });
          return;
        }

        const savedMsg = await directChatService.sendMessage(
          chatId,
          socket.user.sub,
          socket.user.username,
          message.trim(),
        );

        io.to(`direct_${chatId}`).emit("new_direct_message", {
          messageId: savedMsg._id,
          chatId,
          senderId: socket.user.sub,
          senderUsername: socket.user.username,
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });
      } catch (err) {
        logger.error("Send direct message error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("direct_typing", ({ chatId, isTyping }) => {
      socket.to(`direct_${chatId}`).emit("direct_user_typing", {
        userId: socket.user.sub,
        username: socket.user.username,
        isTyping,
      });
    });

    socket.on("leave_direct_chat", (chatId) => {
      socket.leave(`direct_${chatId}`);
      logger.info(`${socket.user.username} left direct chat: ${chatId}`);
    });

    // ════════════════════════════════════════════════════════════
    // LAYER 2 — Community Chat (same as before)
    // ════════════════════════════════════════════════════════════

    socket.on("join_community", async (communityId) => {
      try {
        const community = await communityService.getCommunity(communityId);
        const isMember = community.members.find(
          (m) => m.userId.toString() === socket.user.sub,
        );
        if (!isMember) {
          socket.emit("error", {
            message: "You are not a member of this community",
          });
          return;
        }
        socket.join(`community_${communityId}`);
        logger.info(`${socket.user.username} joined community: ${communityId}`);
      } catch (err) {
        logger.error("Join community error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("send_community_message", async ({ communityId, message }) => {
      try {
        if (!message?.trim()) return;
        if (message.length > 500) {
          socket.emit("error", { message: "Message too long (max 500 chars)" });
          return;
        }

        const savedMsg = await communityService.sendMessage(
          communityId,
          socket.user.sub,
          socket.user.username,
          message.trim(),
        );

        io.to(`community_${communityId}`).emit("new_community_message", {
          messageId: savedMsg._id,
          communityId,
          senderId: socket.user.sub,
          senderUsername: socket.user.username,
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });
      } catch (err) {
        logger.error("Send community message error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("community_typing", ({ communityId, isTyping }) => {
      socket.to(`community_${communityId}`).emit("community_user_typing", {
        communityId,
        userId: socket.user.sub,
        username: socket.user.username,
        isTyping,
      });
    });

    socket.on("leave_community", async (communityId) => {
      try {
        socket.leave(`community_${communityId}`);
        logger.info(`${socket.user.username} left community: ${communityId}`);
      } catch (err) {
        logger.error("Leave community error:", err.message);
      }
    });

    // ─── Disconnect — multi-device safe
    socket.on("disconnect", async () => {
      try {
        const activeSockets = await io.in(`user:${userId}`).fetchSockets();

        if (activeSockets.length > 0) {
          logger.info(
            `${socket.user.username} still has ${activeSockets.length} active socket(s)`,
          );
          return;
        }

        const lastSeenAt = new Date();

        await redis.set(
          `user_status:${userId}`,
          JSON.stringify({
            status: "offline",
            lastSeenAt: lastSeenAt.toISOString(),
          }),
        );

        const participantUserIds =
          await directChatService.getDirectChatParticipantIds(userId);

        for (const participantUserId of participantUserIds) {
          io.to(`user:${participantUserId}`).emit("user_status_changed", {
            userId,
            status: "offline",
            lastSeenAt,
          });
        }

        logger.info(`User disconnected: ${socket.user.username}`);
      } catch (err) {
        logger.error("Disconnect presence error:", err.message);
      }
    });
  });

  return io;
};

export default initSocket;
