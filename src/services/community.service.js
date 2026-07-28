import Community from "../models/Community.js";
import CommunityMessage from "../models/CommunityMessage.js";
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

  return communities;
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
  const communities = await Community.find(query)
    .select("-members")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

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
