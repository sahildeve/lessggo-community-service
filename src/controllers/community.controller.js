import * as communityService from "../services/community.service.js";
import { success, error } from "../utils/response.js";
import logger from "../utils/logger.js";
import { createNotification } from "../utils/notification.js";

// ─── Create Community
export const createCommunity = async (req, res) => {
  try {
    const community = await communityService.createCommunity(
      req.user.sub,
      req.user.username,
      req.body,
    );
    return success(res, { community }, "Community created successfully", 201);
  } catch (err) {
    logger.error("Create community error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get My Communities
export const getMyCommunitites = async (req, res) => {
  try {
    const communities = await communityService.getMyCommunitites(req.user.sub);
    return success(res, { communities }, "My communities fetched successfully");
  } catch (err) {
    logger.error("Get my communities error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Join Community
export const joinCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { community, status } = await communityService.joinCommunity(
      communityId,
      req.user.sub,
      req.user.fullName || req.user.username,
    );

    const io = req.app.get("io");

    if (status === "pending") {
      // Admin ko notify karo
      if (io) {
        io.to(`user:${community.createdBy.userId.toString()}`).emit(
          "community_join_request",
          {
            communityId,
            communityName: community.name,
            userId: req.user.sub,
            username: req.user.fullName || req.user.username,
            message: `${req.user.fullName || req.user.username} wants to join your community`,
          },
        );
      }

      await createNotification({
        userId: community.createdBy.userId,
        type: "community_join_request",
        title: "New Join Request",
        message: `${req.user.fullName || req.user.username} wants to join "${community.name}"`,
        data: { communityId, userId: req.user.sub },
      });

      return success(
        res,
        { status: "pending" },
        "Join request sent, waiting for admin approval",
      );
    }

    // Public — seedha join
    await communityService.saveSystemMessage(
      communityId,
      `${req.user.fullName || req.user.username} joined the community`,
    );

    if (io) {
      io.to(`community_${communityId}`).emit("community_system_message", {
        message: `${req.user.fullName || req.user.username} joined the community`,
        timestamp: new Date(),
      });
    }

    await createNotification({
      userId: community.createdBy.userId,
      type: "join_community",
      title: "New Member Joined",
      message: `${req.user.fullName || req.user.username} joined "${community.name}"`,
      data: { communityId, userId: req.user.sub },
    });

    return success(
      res,
      { community, status: "active" },
      "Joined community successfully",
    );
  } catch (err) {
    logger.error("Join community error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// --- AdminRespondToJoinRequest
export const respondToJoinRequest = async (req, res) => {
  try {
    const { communityId, userId } = req.params;
    const { action } = req.body;

    if (!["accepted", "rejected"].includes(action)) {
      return error(res, "Action must be accepted or rejected", 400);
    }

    const { community, requestUser } =
      await communityService.respondToJoinRequest(
        communityId,
        req.user.sub,
        userId,
        action,
      );

    const io = req.app.get("io");

    // User ko realtime notify
    if (io) {
      io.to(`user:${userId}`).emit(
        action === "accepted"
          ? "community_join_accepted"
          : "community_join_rejected",
        {
          communityId,
          communityName: community.name,
          message:
            action === "accepted"
              ? `Your request to join "${community.name}" was accepted!`
              : `Your request to join "${community.name}" was rejected`,
        },
      );
    }

    await createNotification({
      userId,
      type:
        action === "accepted"
          ? "community_join_accepted"
          : "community_join_rejected",
      title:
        action === "accepted"
          ? "Join Request Accepted!"
          : "Join Request Rejected",
      message:
        action === "accepted"
          ? `Your request to join "${community.name}" was accepted!`
          : `Your request to join "${community.name}" was rejected`,
      data: { communityId },
    });

    if (action === "accepted") {
      await communityService.saveSystemMessage(
        communityId,
        `${requestUser.username} joined the community`,
      );

      if (io) {
        io.to(`community_${communityId}`).emit("community_system_message", {
          message: `${requestUser.username} joined the community`,
          timestamp: new Date(),
        });
      }
    }

    return success(res, { community }, `Request ${action} successfully`);
  } catch (err) {
    logger.error("Respond to join request error:", {
      message: err.message,
      stack: err.stack,
    });

    return error(res, err.message, err.status || 500);
  }
};

// getJoinRequests — admin ke liye
export const getJoinRequests = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await communityService.getCommunity(communityId);

    // Admin check
    const isAdmin = community.members.find(
      (m) => m.userId.toString() === req.user.sub && m.role === "admin",
    );
    if (!isAdmin) {
      return error(res, "Only admin can view join requests", 403);
    }

    return success(
      res,
      {
        joinRequests: community.joinRequests,
        count: community.joinRequests.length,
      },
      "Join requests fetched",
    );
  } catch (err) {
    logger.error("Get join requests error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Leave Community
export const leaveCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await communityService.leaveCommunity(
      communityId,
      req.user.sub,
    );

    await communityService.saveSystemMessage(
      communityId,
      `${req.user.fullName || req.user.username} left the community`,
    );

    const io = req.app.get("io");
    if (io) {
      io.to(`community_${communityId}`).emit("community_system_message", {
        message: `${req.user.fullName || req.user.username} left the community`,
        timestamp: new Date(),
      });
    }

    if (community.createdBy.userId.toString() !== req.user.sub) {
      await createNotification({
        userId: community.createdBy.userId,
        type: "leave_community",
        title: "Member Left",
        message: `${req.user.fullName || req.user.username} left your community "${community.name}"`,
        data: { communityId, userId: req.user.sub },
      });
    }

    return success(res, {}, "Left community successfully");
  } catch (err) {
    logger.error("Leave community error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Delete Community
export const deleteCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await communityService.deleteCommunity(communityId, req.user.sub);

    const io = req.app.get("io");

    // Sab members ko notify karo (creator ko chhod ke)
    for (const member of community.members) {
      if (member.userId.toString() === req.user.sub) continue;

      if (io) {
        io.to(`user:${member.userId.toString()}`).emit("community_deleted", {
          communityId,
          communityName: community.name,
          message: `"${community.name}" has been deleted by the admin`,
        });
      }

      await createNotification({
        userId: member.userId,
        type: "community_deleted",
        title: "Community Deleted",
        message: `"${community.name}" has been deleted by the admin`,
        data: { communityId },
      });
    }

    return success(res, {}, "Community deleted successfully");
  } catch (err) {
    logger.error("Delete community error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get Community
export const getCommunity = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await communityService.getCommunity(communityId);
    return success(res, { community }, "Community fetched successfully");
  } catch (err) {
    logger.error("Get community error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Search Communities
export const searchCommunities = async (req, res) => {
  try {
    const { city, search } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const data = await communityService.searchCommunities({
      city,
      search,
      page,
      limit,
    });
    return success(res, data, "Communities fetched successfully");
  } catch (err) {
    logger.error("Search communities error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get Community Messages
export const getCommunityMessages = async (req, res) => {
  try {
    const { communityId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const data = await communityService.getCommunityMessages(
      communityId,
      req.user.sub,
      page,
      limit,
    );
    return success(res, data, "Messages fetched successfully");
  } catch (err) {
    logger.error("Get community messages error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};
