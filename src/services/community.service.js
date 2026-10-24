import Community from "../models/Community.js";
import CommunityMessage from "../models/CommunityMessage.js";
import { getUsersByIds } from "../utils/authServiceClient.js";
import logger from "../utils/logger.js";

// ─── Create Community
export const createCommunity = async (
  userId,
  username,
  { name, description, city, isPrivate, maxMembers },
) => {
  const community = await Community.create({
    name,
    description,
    city,
    isPrivate: isPrivate || false,
    maxMembers: maxMembers || 100,
    createdBy: { userId, username },
    members: [
      {
        userId,
        username,
        role: "admin",
        joinedAt: new Date(),
      },
    ],
  });

  return community;
};

// ─── Join Community
export const joinCommunity = async (communityId, userId, username) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }
  if (!community.isActive) {
    const err = new Error("Community is no longer active");
    err.status = 400;
    throw err;
  }
  if (community.members.length >= community.maxMembers) {
    const err = new Error("Community is full");
    err.status = 400;
    throw err;
  }

  // Already member check
  const alreadyMember = community.members.find(
    (m) => m.userId.toString() === userId,
  );
  if (alreadyMember) {
    const err = new Error("You are already a member");
    err.status = 409;
    throw err;
  }

  // ── Private community
  if (community.isPrivate) {
    const alreadyRequested = community.joinRequests.find(
      (r) => r.userId.toString() === userId,
    );
    if (alreadyRequested) {
      const err = new Error("Join request already sent");
      err.status = 409;
      throw err;
    }

    community.joinRequests.push({
      userId,
      username,
      requestedAt: new Date(),
    });
    await community.save();
    return { community, status: "pending" };
  }

  // ── Public community
  community.members.push({
    userId,
    username,
    role: "member",
    joinedAt: new Date(),
  });
  await community.save();
  return { community, status: "active" };
};

// ---- Admin repondeToJoinRequest
export const respondToJoinRequest = async (
  communityId,
  adminUserId,
  requestUserId,
  action,
) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }

  // Admin check
  const admin = community.members.find(
    (m) => m.userId.toString() === adminUserId && m.role === "admin",
  );
  if (!admin) {
    const err = new Error("Only admin can accept/reject requests");
    err.status = 403;
    throw err;
  }

  // Request find karo
  const requestIndex = community.joinRequests.findIndex(
    (r) => r.userId.toString() === requestUserId,
  );
  if (requestIndex === -1) {
    const err = new Error("Join request not found");
    err.status = 404;
    throw err;
  }

  const request = community.joinRequests[requestIndex];

  // Request remove karo
  community.joinRequests.splice(requestIndex, 1);

  if (action === "accepted") {
    community.members.push({
      userId: request.userId,
      username: request.username,
      role: "member",
      joinedAt: new Date(),
    });
  }

  await community.save();
  return { community, action, requestUser: request };
};

// ─── Get MyCommunities (user jis communities me joined hai)
export const getMyCommunitites = async (userId) => {
  const communities = await Community.find({
    "members.userId": userId,
    isActive: true,
  })
    .select("-__v")
    .sort({ lastMessageAt: -1, createdAt: -1 })
    .lean();

  if (!communities.length) return [];

  // ── Sab members + creators ki info auth service se (ek hi batch call)
  const allUserIds = communities.flatMap((c) => [
    c.createdBy?.userId?.toString(),
    ...(c.members || []).map((m) => m.userId.toString()),
  ]);

  const userInfoMap = await getUsersByIds(allUserIds);

  // ── Snapshot + fresh info merge karne wala helper
  const enrich = (snapshot) => {
    const id = snapshot.userId.toString();
    const fresh = userInfoMap[id];

    return {
      userId: snapshot.userId,
      username: fresh?.username ?? snapshot.username ?? null,
      fullName: fresh?.fullName ?? snapshot.username ?? null,
      profilePicture: fresh?.profilePicture ?? null,
      age: fresh?.age ?? null,
      gender: fresh?.gender ?? null,
      designation: fresh?.designation ?? null,
      interests: fresh?.interests ?? [],
    };
  };

  // ── Har community ke liye unread count + enriched members
  const communitiesWithUnread = await Promise.all(
    communities.map(async (community) => {
      const unreadCount = await CommunityMessage.countDocuments({
        communityId: community._id,
        senderId: { $ne: userId },
        "seenBy.userId": { $ne: userId },
        isDeleted: false,
        messageType: "text",
      });

      const members = (community.members || []).map((m) => ({
        ...enrich(m),
        role: m.role,
        status: m.status,
        joinedAt: m.joinedAt,
        _id: m._id,
      }));

      // ── joinRequests sirf admin ko — normal members ko nahi
      const isAdmin = (community.members || []).some(
        (m) => m.userId.toString() === userId && m.role === "admin",
      );

      const { joinRequests, ...rest } = community;

      return {
        ...rest,
        ...(isAdmin ? { joinRequests } : {}),
        createdBy: community.createdBy
          ? enrich(community.createdBy)
          : community.createdBy,
        members,
        memberCount: members.length,
        unreadCount,
      };
    }),
  );

  return communitiesWithUnread;
};

// ─── Leave Community
export const leaveCommunity = async (communityId, userId) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }

  // Owner leave nahi kar sakta
  if (community.createdBy.userId.toString() === userId) {
    const err = new Error("Owner cannot leave — delete community instead");
    err.status = 400;
    throw err;
  }

  community.members = community.members.filter(
    (m) => m.userId.toString() !== userId,
  );
  await community.save();

  return community;
};

// ─── Delete Community (only owner)
export const deleteCommunity = async (communityId, userId) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }
  if (community.createdBy.userId.toString() !== userId) {
    const err = new Error("Only owner can delete community");
    err.status = 403;
    throw err;
  }

  // Saare messages bhi delete karo
  await CommunityMessage.deleteMany({ communityId });
  await Community.findByIdAndDelete(communityId);

  return community;
};

// ─── Get Community
export const getCommunity = async (communityId) => {
  const community = await Community.findById(communityId).lean();

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }

  return community;
};

// ─── Search Communities
export const searchCommunities = async ({
  city,
  search,
  page = 1,
  limit = 20,
}) => {
  const query = { isActive: true };

  if (city) query.city = new RegExp(city, "i");
  if (search) query.$text = { $search: search };

  const skip = (page - 1) * limit;

  const communities = await Community.aggregate([
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      // ── memberCount added
      $addFields: {
        memberCount: { $size: { $ifNull: ["$members", []] } },
      },
    },
    {
      $project: {
        members: 0,
        joinRequests: 0,
        __v: 0,
      },
    },
  ]);

  const total = await Community.countDocuments(query);

  return {
    communities,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  };
};

// ─── Send Community Message
export const sendMessage = async (
  communityId,
  senderId,
  senderUsername,
  message,
) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }

  // Check member hai
  const isMember = community.members.find(
    (m) => m.userId.toString() === senderId,
  );
  if (!isMember) {
    const err = new Error("You are not a member of this community");
    err.status = 403;
    throw err;
  }

  const msg = await CommunityMessage.create({
    communityId,
    senderId,
    senderUsername,
    message,
    messageType: "text",
  });

  // Update last message
  await Community.findByIdAndUpdate(communityId, {
    lastMessage: message,
    lastMessageAt: new Date(),
  });

  return msg;
};

// ─── Get Community Messages
export const getCommunityMessages = async (
  communityId,
  userId,
  page = 1,
  limit = 50,
) => {
  const community = await Community.findById(communityId);

  if (!community) {
    const err = new Error("Community not found");
    err.status = 404;
    throw err;
  }

  // Check member hai
  const isMember = community.members.find(
    (m) => m.userId.toString() === userId,
  );
  if (!isMember) {
    const err = new Error("You are not a member of this community");
    err.status = 403;
    throw err;
  }

  // ── Messages khulte hi seen mark karo (page 1 par hi)
  if (page === 1) {
    await markCommunityChatAsRead(communityId, userId);
  }

  const skip = (page - 1) * limit;
  const messages = await CommunityMessage.find({
    communityId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await CommunityMessage.countDocuments({
    communityId,
    isDeleted: false,
  });

  return {
    messages: messages.reverse(),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page < Math.ceil(total / limit),
    },
  };
};

// ─── Save System Message
export const saveSystemMessage = async (communityId, message) => {
  const msg = await CommunityMessage.create({
    communityId,
    senderId: "000000000000000000000000",
    senderUsername: "System",
    message,
    messageType: "system",
  });
  return msg;
};

// ─── Unread count — kitni communities me unread hain (messages nahi)
export const getCommunityUnreadCount = async (userId) => {
  const communities = await Community.find({
    "members.userId": userId,
  })
    .select("_id")
    .lean();

  const communityIds = communities.map((c) => c._id);
  if (!communityIds.length) return 0;

  const withUnread = await CommunityMessage.distinct("communityId", {
    communityId: { $in: communityIds },
    senderId: { $ne: userId },
    "seenBy.userId": { $ne: userId },
    isDeleted: false,
    messageType: "text",
  });

  return withUnread.length;
};

// ─── Mark all unread messages in a community as seen by user
export const markCommunityChatAsRead = async (communityId, userId) => {
  await CommunityMessage.updateMany(
    {
      communityId,
      senderId: { $ne: userId },
      "seenBy.userId": { $ne: userId },
      isDeleted: false,
      messageType: "text",
    },
    {
      $addToSet: { seenBy: { userId, seenAt: new Date() } },
    },
  );
};
