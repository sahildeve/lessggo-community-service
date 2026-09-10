import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import * as directChatService from "./services/directChat.service.js";
import * as communityService from "./services/community.service.js";
import redis from "./config/redis.js";
import logger from "./utils/logger.js";
import { getDisplayName } from "./utils/displayName.js";
import { getUsersByIds } from "./utils/authServiceClient.js";

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
    socket.join(`user:${socket.user.sub}`);

    const userId = socket.user.sub;

    // ─── User info ek baar fetch, poore connection ke liye cache
    socket.userInfo = null;
    try {
      const map = await getUsersByIds([userId]);
      socket.userInfo = map[String(userId)] ?? null;
    } catch {
      // Fetch fail ho to JWT wala data fallback rahega
    }

    const displayName =
      socket.userInfo?.fullName ?? getDisplayName(socket.user);

    logger.info(`User connected: ${displayName}`);

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

    socket.on("join_direct_chat", async (payload) => {
      try {
        const chatId = typeof payload === "string" ? payload : payload?.chatId;
        if (!chatId) {
          socket.emit("error", { message: "chatId is required" });
          return;
        }

        socket.join(`direct_${chatId}`);
        await directChatService.markDirectChatAsRead(chatId, userId);
        logger.info(`${displayName} joined direct chat: ${chatId}`);
      } catch (err) {
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("send_direct_message", async ({ chatId, message }) => {
      try {
        if (!chatId) {
          socket.emit("error", { message: "chatId is required" });
          return;
        }
        if (!message?.trim()) return;
        if (message.length > 500) {
          socket.emit("error", { message: "Message too long (max 500 chars)" });
          return;
        }

        const savedMsg = await directChatService.sendMessage(
          chatId,
          userId,
          displayName,
          message.trim(),
        );

        io.to(`direct_${chatId}`).emit("new_direct_message", {
          messageId: savedMsg._id,
          chatId,
          senderId: userId,
          senderUsername: displayName,
          senderFullName: displayName,
          senderProfilePicture: socket.userInfo?.profilePicture ?? null,
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });

        // ── Jo log abhi chat room me hain, unke liye turant seen mark karo
        const socketsInRoom = await io.in(`direct_${chatId}`).fetchSockets();
        for (const s of socketsInRoom) {
          if (s.user.sub !== userId) {
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
        userId,
        username: displayName,
        isTyping,
      });
    });

    socket.on("leave_direct_chat", (payload) => {
      const chatId = typeof payload === "string" ? payload : payload?.chatId;
      if (!chatId) return;

      socket.leave(`direct_${chatId}`);
      logger.info(`${displayName} left direct chat: ${chatId}`);
    });

    // ════════════════════════════════════════════════════════════
    // LAYER 2 — Community Chat
    // ════════════════════════════════════════════════════════════

    socket.on("join_community", async (payload) => {
      try {
        const communityId =
          typeof payload === "string" ? payload : payload?.communityId;
        if (!communityId) {
          socket.emit("error", { message: "communityId is required" });
          return;
        }

        const community = await communityService.getCommunity(communityId);
        const isMember = community.members.find(
          (m) => m.userId.toString() === userId,
        );
        if (!isMember) {
          socket.emit("error", {
            message: "You are not a member of this community",
          });
          return;
        }
        socket.join(`community_${communityId}`);
        await communityService.markCommunityChatAsRead(communityId, userId);
        logger.info(`${displayName} joined community: ${communityId}`);
      } catch (err) {
        logger.error("Join community error:", err.message);
        socket.emit("error", { message: err.message });
      }
    });

    socket.on("send_community_message", async ({ communityId, message }) => {
      try {
        if (!communityId) {
          socket.emit("error", { message: "communityId is required" });
          return;
        }
        if (!message?.trim()) return;
        if (message.length > 500) {
          socket.emit("error", { message: "Message too long (max 500 chars)" });
          return;
        }

        const savedMsg = await communityService.sendMessage(
          communityId,
          userId,
          displayName,
          message.trim(),
        );

        io.to(`community_${communityId}`).emit("new_community_message", {
          messageId: savedMsg._id,
          communityId,
          senderId: userId,
          senderUsername: displayName,
          senderFullName: displayName,
          senderProfilePicture: socket.userInfo?.profilePicture ?? null,
          message: savedMsg.message,
          timestamp: savedMsg.createdAt,
        });

        // ── Jo log abhi community room me hain, unke liye turant seen mark karo
        const socketsInRoom = await io
          .in(`community_${communityId}`)
          .fetchSockets();
        for (const s of socketsInRoom) {
          if (s.user.sub !== userId) {
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
        userId,
        username: displayName,
        isTyping,
      });
    });

    socket.on("leave_community", async (payload) => {
      try {
        const communityId =
          typeof payload === "string" ? payload : payload?.communityId;
        if (!communityId) return;

        socket.leave(`community_${communityId}`);
        logger.info(`${displayName} left community: ${communityId}`);
      } catch (err) {
        logger.error("Leave community error:", err.message);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const activeSockets = await io.in(`user:${userId}`).fetchSockets();

        if (activeSockets.length > 0) {
          logger.info(
            `${displayName} still has ${activeSockets.length} active socket(s)`,
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

        logger.info(`User disconnected: ${displayName}`);
      } catch (err) {
        logger.error("Disconnect presence error:", err.message);
      }
    });
  });

  return io;
};

export default initSocket;
