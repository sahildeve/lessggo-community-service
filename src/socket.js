import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import * as directChatService from "./services/directChat.service.js";
import * as communityService from "./services/community.service.js";
import logger from "./utils/logger.js";

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
      credentials: true,
    },
  });

  // ─── Auth Middleware
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

  // ─── Connection
  io.on("connection", (socket) => {
    logger.info(`User connected: ${socket.user.username}`);

    // ─── Personal User Room
    socket.join(`user:${socket.user.sub}`);

    logger.info(
      `${socket.user.username} joined personal room: user:${socket.user.sub}`,
    );

    // ════════════════════════════════════════════════════════════════════════
    // LAYER 1 — Direct Chat
    // ════════════════════════════════════════════════════════════════════════

    // ─── Join Direct Chat Room
    socket.on("join_direct_chat", async (chatId) => {
      try {
        socket.join(`direct_${chatId}`);
        logger.info(`${socket.user.username} joined direct chat: ${chatId}`);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    // ─── Send Direct Message
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

        // Room me dono users ko bhejo
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

    // ─── Typing Indicator (Direct)
    socket.on("direct_typing", ({ chatId, isTyping }) => {
      socket.to(`direct_${chatId}`).emit("direct_user_typing", {
        userId: socket.user.sub,
        username: socket.user.username,
        isTyping,
      });
    });

    // ─── Leave Direct Chat
    socket.on("leave_direct_chat", (chatId) => {
      socket.leave(`direct_${chatId}`);
      logger.info(`${socket.user.username} left direct chat: ${chatId}`);
    });

    // ════════════════════════════════════════════════════════════════════════
    // LAYER 2 — Community Chat
    // ════════════════════════════════════════════════════════════════════════

    // ─── Join Community Room
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

    // ─── Send Community Message
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

        // Sab community members ko bhejo
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

    // ─── Typing Indicator (Community)
    socket.on("community_typing", ({ communityId, isTyping }) => {
      socket.to(`community_${communityId}`).emit("community_user_typing", {
        communityId, // added
        userId: socket.user.sub,
        username: socket.user.username,
        isTyping,
      });
    });

    // ─── Leave Community Room
    socket.on("leave_community", async (communityId) => {
      try {
        socket.leave(`community_${communityId}`);
        logger.info(`${socket.user.username} left community: ${communityId}`);
      } catch (err) {
        logger.error("Leave community error:", err.message);
      }
    });

    // ─── Disconnect
    socket.on("disconnect", () => {
      logger.info(`User disconnected: ${socket.user.username}`);
    });
  });

  return io;
};

export default initSocket;
