import * as directChatService from "../services/directChat.service.js";
import { success, error } from "../utils/response.js";
import logger from "../utils/logger.js";
import { createNotification } from "../utils/notification.js";
import { sendChatRequestEmail } from "../utils/emailNotification.js";
import Community from "../models/Community.js";

// ─── Send Chat Request
export const sendChatRequest = async (req, res) => {
  try {
    const { toUserId, toUsername, requestMessage } = req.body;
    const chat = await directChatService.sendChatRequest(
      req.user.sub,
      req.user.username,
      req.user.fullName || req.user.username, // sender fullName
      toUserId,
      toUsername,
      req.body.toFullName || toUsername, // receiver fullName
      requestMessage,
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${toUserId}`).emit("direct_chat_request", {
        chatId: chat._id,
        fromUserId: req.user.sub,
        fromUsername: req.user.fullName || req.user.username,
        requestMessage,
        message: `${req.user.fullName || req.user.username} sent you a chat request`,
      });
    }

    await createNotification({
      userId: toUserId,
      type: "direct_chat_request",
      title: "New Chat Request",
      message: `${req.user.fullName || req.user.username} wants to chat with you`,
      data: { chatId: chat._id, fromUserId: req.user.sub },
    });

    await sendChatRequestEmail(
      toUserId,
      req.user.fullName || req.user.username,
    );

    return success(res, { chat }, "Chat request sent successfully", 201);
  } catch (err) {
    logger.error("Send chat request error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Respond to Chat Request
export const respondToChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { action } = req.body;
    const chat = await directChatService.respondToChatRequest(
      chatId,
      req.user.sub,
      action,
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${chat.requestedBy}`).emit(
        action === "accepted" ? "direct_chat_accepted" : "direct_chat_rejected",
        {
          chatId: chat._id,
          fromUsername: req.user.fullName || req.user.username,
          message:
            action === "accepted"
              ? `${req.user.fullName || req.user.username} accepted your chat request`
              : `${req.user.fullName || req.user.username} rejected your chat request`,
        },
      );
    }

    await createNotification({
      userId: chat.requestedBy,
      type:
        action === "accepted" ? "direct_chat_accepted" : "direct_chat_rejected",
      title:
        action === "accepted"
          ? "Chat Request Accepted!"
          : "Chat Request Rejected",
      message:
        action === "accepted"
          ? `${req.user.fullName || req.user.username} accepted your chat request`
          : `${req.user.fullName || req.user.username} rejected your chat request`,
      data: { chatId: chat._id },
    });

    return success(res, { chat }, `Chat request ${action}`);
  } catch (err) {
    logger.error("Respond to chat request error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get Chat History — same
export const getChatHistory = async (req, res) => {
  try {
    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const data = await directChatService.getChatHistory(
      chatId,
      req.user.sub,
      page,
      limit,
    );
    return success(res, data, "Chat history fetched");
  } catch (err) {
    logger.error("Get chat history error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get All User Chats — same
export const getUserChats = async (req, res) => {
  try {
    const chats = await directChatService.getUserChats(req.user.sub);
    return success(res, { chats }, "Chats fetched successfully");
  } catch (err) {
    logger.error("Get user chats error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get Pending Requests — same
export const getPendingRequests = async (req, res) => {
  try {
    // ─── Direct chat pending requests
    const directRequests = await directChatService.getPendingRequests(
      req.user.sub,
    );

    // ─── Community join requests
    const communities = await Community.find({
      "joinRequests.userId": req.user.sub,
    })
      .select("_id name joinRequests")
      .lean();

    const communityJoinRequests = communities.map((community) => {
      const request = community.joinRequests.find(
        (r) => r.userId.toString() === req.user.sub,
      );

      return {
        type: "community_join",
        communityId: community._id,
        userId: req.user.sub,
        communityName: community.name,
        requestedAt: request?.requestedAt,
      };
    });

    return success(
      res,
      {
        directRequests,
        communityJoinRequests,
      },
      "Pending requests fetched",
    );
  } catch (err) {
    logger.error("Get pending requests error:", {
      message: err.message,
      stack: err.stack,
    });

    return error(res, err.message, err.status || 500);
  }
};

// ─── Withdraw Direct Chat Request
export const withdrawDirectChatRequest = async (req, res) => {
  try {
    const { chatId } = req.params;

    const { otherUser } = await directChatService.withdrawDirectChatRequest(
      chatId,
      req.user.sub,
    );

    const io = req.app.get("io");
    if (io && otherUser) {
      io.to(`user:${otherUser.userId.toString()}`).emit("direct_chat_withdrawn", {
        chatId,
        byUserId: req.user.sub,
        byUsername: req.user.fullName || req.user.username,
        message: `${req.user.fullName || req.user.username} withdrew the chat`,
      });
    }

    return success(res, {}, "Chat withdrawn successfully");
  } catch (err) {
    logger.error("Withdraw direct chat error:", { message: err.message, stack: err.stack });
    return error(res, err.message, err.status || 500);
  }
};