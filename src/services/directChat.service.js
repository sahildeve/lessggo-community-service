import DirectChat from "../models/DirectChat.js";
import DirectMessage from "../models/DirectMessage.js";
import logger from "../utils/logger.js";

// ─── Send Chat Request
export const sendChatRequest = async (
  requestedBy,
  requestedByUsername,
  requestedByFullName,
  toUserId,
  toUsername,
  toFullName,
  requestMessage,
) => {
  // ─── Check: Apne aap ko request nahi bhej sakte

  if (requestedBy === toUserId) {
    const err = new Error("You cannot send a request to yourself");
    err.status = 400;
    throw err;
  }

  // Check karo pehle se request hai ya nahi
  const existing = await DirectChat.findOne({
    "participants.userId": { $all: [requestedBy, toUserId] },
  });

  if (existing) {
    if (existing.status === "accepted") {
      const err = new Error("Chat already exists");
      err.status = 409;
      throw err;
    }
    if (existing.status === "pending") {
      const err = new Error("Request already sent");
      err.status = 409;
      throw err;
    }
    if (existing.status === "rejected") {
      // Rejected tha — dobara request allow karo
      existing.status = "pending";
      existing.requestedBy = requestedBy;

      // Latest user snapshot update karo
      existing.participants = [
        {
          userId: requestedBy,
          username: requestedByUsername,
          fullName: requestedByFullName,
        },
        {
          userId: toUserId,
          username: toUsername,
          fullName: toFullName,
        },
      ];

      existing.requestMessage = requestMessage || null;

      await existing.save();
      return existing;
    }
  }

  const chat = await DirectChat.create({
    participants: [
      {
        userId: requestedBy,
        username: requestedByUsername,
        fullName: requestedByFullName,
      },
      {
        userId: toUserId,
        username: toUsername,
        fullName: toFullName,
      },
    ],
    requestedBy,
    requestMessage: requestMessage || null, // ← ye add karo
    status: "pending",
  });

  return chat;
};

// ─── Respond to Chat Request
export const respondToChatRequest = async (chatId, userId, action) => {
  const chat = await DirectChat.findById(chatId);

  if (!chat) {
    const err = new Error("Chat request not found");
    err.status = 404;
    throw err;
  }

  // Sirf jo receive kiya usne respond karna chahiye
  const isReceiver = chat.participants.find(
    (p) =>
      p.userId.toString() === userId && chat.requestedBy.toString() !== userId,
  );

  if (!isReceiver) {
    const err = new Error("You cannot respond to this request");
    err.status = 403;
    throw err;
  }

  if (chat.status !== "pending") {
    const err = new Error("Request already responded to");
    err.status = 400;
    throw err;
  }

  chat.status = action; // 'accepted' or 'rejected'
  await chat.save();
  return chat;
};

// ─── Send Direct Message
export const sendMessage = async (
  chatId,
  senderId,
  senderUsername,
  message,
) => {
  const chat = await DirectChat.findById(chatId);

  if (!chat) {
    const err = new Error("Chat not found");
    err.status = 404;
    throw err;
  }
  if (chat.status !== "accepted") {
    const err = new Error("Chat request not accepted yet");
    err.status = 403;
    throw err;
  }

  // Check karo sender is chat ka member hai
  const isMember = chat.participants.find(
    (p) => p.userId.toString() === senderId,
  );
  if (!isMember) {
    const err = new Error("You are not a member of this chat");
    err.status = 403;
    throw err;
  }

  const msg = await DirectMessage.create({
    chatId,
    senderId,
    senderUsername,
    message,
  });

  // Update last message
  await DirectChat.findByIdAndUpdate(chatId, {
    lastMessage: message,
    lastMessageAt: new Date(),
  });

  return msg;
};

// ─── Get Chat History
export const getChatHistory = async (chatId, userId, page = 1, limit = 50) => {
  const chat = await DirectChat.findById(chatId);

  if (!chat) {
    const err = new Error("Chat not found");
    err.status = 404;
    throw err;
  }

  const isMember = chat.participants.find(
    (p) => p.userId.toString() === userId,
  );
  if (!isMember) {
    const err = new Error("You are not a member of this chat");
    err.status = 403;
    throw err;
  }

  const skip = (page - 1) * limit;
  const messages = await DirectMessage.find({ chatId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const total = await DirectMessage.countDocuments({
    chatId,
    isDeleted: false,
  });

  return {
    chat,
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

// ─── Get All Chats of User
export const getUserChats = async (userId) => {
  const chats = await DirectChat.find({
    "participants.userId": userId,
    status: "accepted",
  })
    .sort({ lastMessageAt: -1 })
    .lean();

  return chats;
};

// ─── Get Pending Requests
export const getPendingRequests = async (userId) => {
  const requests = await DirectChat.find({
    "participants.userId": userId,
    requestedBy: { $ne: userId },
    status: "pending",
  }).lean();

  return requests;
};

// export const getRequestStatusWithUsers = async (currentUserId, otherUserIds) => {
//   const chats = await DirectChat.find({
//     $and: [
//       { "participants.userId": currentUserId },
//       { "participants.userId": { $in: otherUserIds } },
//     ],
//   }).lean();

//   const statusMap = {};

//   chats.forEach((chat) => {
//     const other = chat.participants.find(
//       (p) => p.userId.toString() !== currentUserId,
//     );
//     if (other) {
//       statusMap[other.userId.toString()] = {
//         chatId: chat._id,
//         status: chat.status,
//         requestedBy: chat.requestedBy.toString(),
//       };
//     }
//   });

//   return statusMap;
// };
