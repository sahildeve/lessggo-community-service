import * as communityService from "../services/community.service.js";
import { success, error } from "../utils/response.js";
import logger from "../utils/logger.js";
import { getDisplayName } from "../utils/displayName.js";
import { getUsersByIds } from "../utils/authServiceClient.js"; // GET APIs ke liye chahiye
import { publishEvent } from "../utils/eventPublisher.js"; // Naya import

// ─── Create Community
export const createCommunity = async (req, res) => {
  try {
    const community = await communityService.createCommunity(
      req.user.sub,
      getDisplayName(req.user),
      req.body,
    );
    return success(res, { community }, "Community created successfully", 201);
  } catch (err) {
    logger.error("Create community error:", { message: err.message, stack: err.stack });
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
    const fallbackName = getDisplayName(req.user);

    const { community, status } = await communityService.joinCommunity(
      communityId,
      req.user.sub,
      fallbackName,
    );

    // ── Pub/Sub: Notify background worker ──
    await publishEvent("COMMUNITY_JOIN_REQUESTED", {
      communityId,
      communityName: community.name,
      adminId: community.createdBy.userId,
      joinerId: req.user.sub,
      fallbackName,
      status, // "pending" ya "active"
    });

    if (status === "pending") {
      return success(
        res,
        { status: "pending" },
        "Join request sent, waiting for admin approval",
      );
    }

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

// ─── Admin Respond To Join Request
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

    // ── Pub/Sub: Background socket/notification/system message ──
    await publishEvent("COMMUNITY_JOIN_RESPONDED", {
      communityId,
      communityName: community.name,
      requesterId: userId,
      requesterUsername: requestUser.username,
      action,
    });

    return success(res, { community }, `Request ${action} successfully`);
  } catch (err) {
    logger.error("Respond to join request error:", {
      message: err.message,
      stack: err.stack,
    });
    return error(res, err.message, err.status || 500);
  }
};

// ─── Get Join Requests (As it is, because GET api)
export const getJoinRequests = async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await communityService.getCommunity(communityId);

    const isAdmin = community.members.find(
      (m) => m.userId.toString() === req.user.sub && m.role === "admin",
    );
    if (!isAdmin) return error(res, "Only admin can view join requests", 403);

    const requesterIds = community.joinRequests.map((r) => r.userId.toString());
    const infoMap = await getUsersByIds(requesterIds);

    const joinRequests = community.joinRequests.map((r) => {
      const fresh = infoMap[r.userId.toString()];
      return {
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
    });

    return success(
      res,
      { joinRequests, count: joinRequests.length },
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

    // ── Pub/Sub: Send event ──
    await publishEvent("COMMUNITY_LEFT", {
      communityId,
      communityName: community.name,
      adminId: community.createdBy.userId,
      leaverId: req.user.sub,
      leaverName: getDisplayName(req.user),
    });

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
    const community = await communityService.deleteCommunity(
      communityId,
      req.user.sub,
    );

    // ── Pub/Sub: Send event ──
    await publishEvent("COMMUNITY_DELETED", {
      communityId,
      communityName: community.name,
      adminId: req.user.sub,
      members: community.members,
    });

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

    const isMember = (community.members || []).some(
      (m) => m.userId.toString() === req.user.sub,
    );

    const isAdmin = (community.members || []).some(
      (m) => m.userId.toString() === req.user.sub && m.role === "admin",
    );

    // ── Non-members ko sirf basic info — members list aur requests nahi
    if (!isMember) {
      const { members, joinRequests, ...publicInfo } = community;

      return success(
        res,
        {
          community: {
            ...publicInfo,
            memberCount: (members || []).length,
            isMember: false,
          },
        },
        "Community fetched successfully",
      );
    }

    // ── joinRequests sirf admin ko
    const { joinRequests, ...rest } = community;

    return success(
      res,
      {
        community: {
          ...rest,
          ...(isAdmin ? { joinRequests } : {}),
          memberCount: (community.members || []).length,
          isMember: true,
          isAdmin,
        },
      },
      "Community fetched successfully",
    );
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
