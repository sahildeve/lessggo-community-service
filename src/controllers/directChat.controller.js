import * as directChatService from "../services/directChat.service.js";
import * as communityService from "../services/community.service.js";
import { success, error } from "../utils/response.js";
import logger from "../utils/logger.js";
import Community from "../models/Community.js";
import { getDisplayName } from "../utils/displayName.js";
import { getUsersByIds } from "../utils/authServiceClient.js";
import redis from "../config/redis.js";
import { publishEvent } from "../utils/eventPublisher.js"; // Naya import

// ─── Send Chat Request
export const sendChatRequest = async (req, res) => {
  try {
    const { toUserId, toUsername, requestMessage } = req.body;
    const fallbackName = getDisplayName(req.user);

    const chat = await directChatService.sendChatRequest(
      req.user.sub,
      fallbackName,
      fallbackName,
      toUserId,
      toUsername || null,
      req.body.toFullName || toUsername || null,
      requestMessage,
    );

    // ── Pub/Sub: Background worker will send Socket, DB Notification and Email ──
    await publishEvent("DIRECT_CHAT_REQUESTED", {
      chatId: chat._id,
      fromUserId: req.user.sub,
      fallbackName,
      toUserId,
      requestMessage,
    });

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

    // ── Pub/Sub ──
    await publishEvent("DIRECT_CHAT_RESPONDED", {
      chatId: chat._id,
      responderId: req.user.sub,
      requesterId: chat.requestedBy,
      fallbackName: getDisplayName(req.user),
      action,
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

// ─── Get Pending Requests
export const getPendingRequests = async (req, res) => {
  try {
    // ─── Direct chat pending requests (jo mujhe mili)
    const directRequests = await directChatService.getPendingRequests(
      req.user.sub,
    );

    // ─── Direct chat sent requests (jo maine bheji, abhi pending hain)
    const sentDirectRequests = await directChatService.getSentRequests(
      req.user.sub,
    );

    // ─── Community join requests JO MAINE BHEJI (requester perspective)
    const communitiesIRequested = await Community.find({
      "joinRequests.userId": req.user.sub,
    })
      .select("_id name joinRequests")
      .lean();

    const communityJoinRequests = communitiesIRequested.map((community) => {
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

    const communitiesIAdmin = await Community.find({
      members: { $elemMatch: { userId: req.user.sub, role: "admin" } },
      "joinRequests.0": { $exists: true }, // sirf jahan pending requests hain
    })
      .select("_id name joinRequests")
      .lean();

    // ── Requesters ki poori info — admin ko card dikhana hai
    const requesterIds = communitiesIAdmin.flatMap((c) =>
      c.joinRequests.map((r) => r.userId.toString()),
    );
    const requesterMap = await getUsersByIds(requesterIds);

    const receivedCommunityJoinRequests = communitiesIAdmin.flatMap(
      (community) =>
        community.joinRequests.map((r) => {
          const fresh = requesterMap[r.userId.toString()];
          return {
            type: "community_join",
            communityId: community._id,
            communityName: community.name,
            userId: r.userId,
            username: fresh?.username ?? null,
            fullName: fresh?.fullName ?? r.username ?? null,
            profilePicture: fresh?.profilePicture ?? null,
            age: fresh?.age ?? null,
            gender: fresh?.gender ?? null,
            designation: fresh?.designation ?? null,
            interests: fresh?.interests ?? [],
            requestedAt: r.requestedAt,
          };
        }),
    );

    return success(
      res,
      {
        directRequests, // direct chat — jo mujhe mili
        sentDirectRequests, // direct chat — jo maine bheji (pending)
        communityJoinRequests, // community — jo maine bheji
        receivedCommunityJoinRequests, // community — jo mujhe milin (main admin hoon)
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

    if (otherUser) {
      await publishEvent("DIRECT_CHAT_WITHDRAWN", {
        chatId,
        withdrawerId: req.user.sub,
        withdrawerName: getDisplayName(req.user),
        otherUserId: otherUser.userId,
      });
    }

    return success(res, {}, "Chat withdrawn successfully");
  } catch (err) {
    logger.error("Withdraw direct chat error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get online/offline status of multiple users
export const getUsersStatus = async (req, res) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return error(res, "userIds array is required", 400);
    }

    const statusMap = await directChatService.getUsersOnlineStatus(
      redis,
      userIds,
    );

    return success(res, { statusMap }, "Status fetched successfully");
  } catch (err) {
    logger.error("Get users status error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get total unread count (direct + community combined)
export const getUnreadCount = async (req, res) => {
  try {
    const [directCount, communityCount] = await Promise.all([
      directChatService.getDirectUnreadCount(req.user.sub),
      communityService.getCommunityUnreadCount(req.user.sub),
    ]);

    return success(
      res,
      {
        directUnread: directCount,
        communityUnread: communityCount,
        totalUnread: directCount + communityCount,
      },
      "Unread count fetched successfully",
    );
  } catch (err) {
    logger.error("Get unread count error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};
