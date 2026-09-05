import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import * as directChatService from "./services/directChat.service.js";
import * as communityService from "./services/community.service.js";
import redis from "./config/redis.js";
import logger from "./utils/logger.js";
import { getDisplayName } from "./utils/displayName.js";

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
    logger.info(`User connected: ${getDisplayName(socket.user)}`);
    socket.join(`user:${socket.user.sub}`);

    const userId = socket.user.sub;

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
    }

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
    // LAYER 1 — Direct Chat
    // ════════════════════════════════════════════════════════════

    socket.on("join_direct_chat", async (chatId) => {
      try {
        socket.join(`direct_${chatId}`);
        await directChatService.markDirectChatAsRead(chatId, userId);
        logger.info(`${getDisplayName(socket.user)} joined direct chat: ${chatId}`);
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
          getDisplayName(socket.user),
          message.trim(),
        );

        io.to(`direct_${chatId}`).emit("new_direct_message", {
          messageId: savedMsg._id,
          chatId,
          senderId: socket.user.sub,
          senderUsername: getDisplayName(socket.user),
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });

        // ── Jo log abhi chat room me hain, unke liye turant seen mark karo
        const socketsInRoom = await io.in(`direct_${chatId}`).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.user.sub !== socket.user.sub) {
            await directChatService.markDirectChatAsRead(chatId, s.user.sub);
          }
        }
      } catch (err) {
        logger.error("Send direct message error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("direct_typing", ({ chatId, isTyping }) => {
      socket.to(`direct_${chatId}`).emit("direct_user_typing", {
        userId: socket.user.sub,
        username: getDisplayName(socket.user),
        isTyping,
      });
    });

    socket.on("leave_direct_chat", (chatId) => {
      socket.leave(`direct_${chatId}`);
      logger.info(`${getDisplayName(socket.user)} left direct chat: ${chatId}`);
    });

    // ════════════════════════════════════════════════════════════
    // LAYER 2 — Community Chat
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
        await communityService.markCommunityChatAsRead(communityId, userId);
        logger.info(`${getDisplayName(socket.user)} joined community: ${communityId}`);
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
          getDisplayName(socket.user),
          message.trim(),
        );

        io.to(`community_${communityId}`).emit("new_community_message", {
          messageId: savedMsg._id,
          communityId,
          senderId: socket.user.sub,
          senderUsername: getDisplayName(socket.user),
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });

        // ── Jo log abhi community room me hain, unke liye turant seen mark karo
        const socketsInRoom = await io
          .in(`community_${communityId}`)
          .fetchSockets();
        for (const s of socketsInRoom) {
          if (s.user.sub !== socket.user.sub) {
            await communityService.markCommunityChatAsRead(
              communityId,
              s.user.sub,
            );
          }
        }
      } catch (err) {
        logger.error("Send community message error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("community_typing", ({ communityId, isTyping }) => {
      socket.to(`community_${communityId}`).emit("community_user_typing", {
        communityId,
        userId: socket.user.sub,
        username: getDisplayName(socket.user),
        isTyping,
      });
    });

    socket.on("leave_community", async (communityId) => {
      try {
        socket.leave(`community_${communityId}`);
        logger.info(`${getDisplayName(socket.user)} left community: ${communityId}`);
      } catch (err) {
        logger.error("Leave community error:", err.message);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const activeSockets = await io.in(`user:${userId}`).fetchSockets();

        if (activeSockets.length > 0) {
          logger.info(
            `${getDisplayName(socket.user)} still has ${activeSockets.length} active socket(s)`,
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

        logger.info(`User disconnected: ${getDisplayName(socket.user)}`);
      } catch (err) {
        logger.error("Disconnect presence error:", err.message);
      }
    });
  });

  return io;
};

export default initSocket;
