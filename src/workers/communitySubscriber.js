import pubsub from "../config/pubsub.js";
import redis from "../config/redis.js";
import logger from "../utils/logger.js";
import { handleSubscriberError } from "../utils/subscriberError.js";
import {
  alreadyProcessed,
  markProcessed,
  releaseProcessed,
} from "../utils/messageDedupe.js";
import { createNotification } from "../utils/notification.js";
import { getUsersByIds } from "../utils/authServiceClient.js";
import { sendChatRequestEmail } from "../utils/emailNotification.js";
import * as communityService from "../services/community.service.js";
import * as directChatService from "../services/directChat.service.js";

import Community from "../models/Community.js";
import CommunityMessage from "../models/CommunityMessage.js";
import DirectChat from "../models/DirectChat.js";
import DirectMessage from "../models/DirectMessage.js";
import Notification from "../models/Notification.js";

const SUBSCRIPTION_NAME =
  process.env.COMMUNITY_EVENTS_SUB || "community-events-sub";

// Dedupe claim aur release dono me same hona chahiye
const SUBSCRIBER_CONTEXT = "community-service:communitySubscriber";

export const startCommunitySubscriber = (io) => {
  try {
    const subscription = pubsub.subscription(SUBSCRIPTION_NAME);

    subscription.on("message", async (message) => {
      try {
        const parsedData = JSON.parse(message.data.toString());
        const { eventType, payload } = parsedData;

        // ── Duplicate delivery (Pub/Sub at-least-once) — pehle hi process ho chuka
        if (await alreadyProcessed(message.id, SUBSCRIBER_CONTEXT)) {
          logger.info(
            `Skipped duplicate community event: ${eventType} (MsgID: ${message.id})`,
          );
          message.ack();
          return;
        }

        // 1. COMMUNITY_JOIN_REQUESTED (Pending / Active)
        if (eventType === "COMMUNITY_JOIN_REQUESTED") {
          const {
            communityId,
            communityName,
            adminId,
            joinerId,
            fallbackName,
            status,
          } = payload;

          const infoMap = await getUsersByIds([joinerId]);
          const info = infoMap[String(joinerId)];
          const joinerName = info?.fullName ?? fallbackName;

          const joiner = {
            userId: joinerId,
            fullName: info?.fullName ?? null,
            profilePicture: info?.profilePicture ?? null,
            age: info?.age ?? null,
            gender: info?.gender ?? null,
            designation: info?.designation ?? null,
            interests: info?.interests ?? [],
          };

          if (status === "pending") {
            if (io) {
              io.to(`user:${adminId.toString()}`).emit(
                "community_join_request",
                {
                  communityId,
                  communityName,
                  userId: joinerId,
                  username: joinerName,
                  user: joiner,
                  message: `${joinerName} wants to join your community`,
                },
              );
            }
            await createNotification({
              userId: adminId,
              type: "community_join_request",
              title: "New Join Request",
              message: `${joinerName} wants to join "${communityName}"`,
              data: { communityId, userId: joinerId },
            });
          } else {
            await communityService.saveSystemMessage(
              communityId,
              `${joinerName} joined the community`,
            );
            if (io) {
              io.to(`community_${communityId}`).emit(
                "community_system_message",
                {
                  message: `${joinerName} joined the community`,
                  user: joiner,
                  timestamp: new Date(),
                },
              );
            }
            await createNotification({
              userId: adminId,
              type: "join_community",
              title: "New Member Joined",
              message: `${joinerName} joined "${communityName}"`,
              data: { communityId, userId: joinerId },
            });
          }
        }

        // 2. COMMUNITY_JOIN_RESPONDED (Accept/Reject)
        if (eventType === "COMMUNITY_JOIN_RESPONDED") {
          const {
            communityId,
            communityName,
            requesterId,
            requesterUsername,
            action,
          } = payload;

          if (io) {
            io.to(`user:${requesterId}`).emit(
              action === "accepted"
                ? "community_join_accepted"
                : "community_join_rejected",
              {
                communityId,
                communityName,
                message:
                  action === "accepted"
                    ? `Your request to join "${communityName}" was accepted!`
                    : `Your request to join "${communityName}" was rejected`,
              },
            );
          }

          await createNotification({
            userId: requesterId,
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
                ? `Your request to join "${communityName}" was accepted!`
                : `Your request to join "${communityName}" was rejected`,
            data: { communityId },
          });

          if (action === "accepted") {
            await communityService.saveSystemMessage(
              communityId,
              `${requesterUsername} joined the community`,
            );
            if (io) {
              io.to(`community_${communityId}`).emit(
                "community_system_message",
                {
                  message: `${requesterUsername} joined the community`,
                  timestamp: new Date(),
                },
              );
            }
          }
        }

        // 3. COMMUNITY_LEFT
        if (eventType === "COMMUNITY_LEFT") {
          const { communityId, communityName, adminId, leaverId, leaverName } =
            payload;

          await communityService.saveSystemMessage(
            communityId,
            `${leaverName} left the community`,
          );
          if (io) {
            io.to(`community_${communityId}`).emit("community_system_message", {
              message: `${leaverName} left the community`,
              timestamp: new Date(),
            });
          }

          if (adminId.toString() !== leaverId.toString()) {
            await createNotification({
              userId: adminId,
              type: "leave_community",
              title: "Member Left",
              message: `${leaverName} left your community "${communityName}"`,
              data: { communityId, userId: leaverId },
            });
          }
        }

        // 4. COMMUNITY_DELETED
        if (eventType === "COMMUNITY_DELETED") {
          const { communityId, communityName, adminId, members } = payload;

          for (const member of members || []) {
            if (member.userId.toString() === adminId.toString()) continue;

            if (io) {
              io.to(`user:${member.userId.toString()}`).emit(
                "community_deleted",
                {
                  communityId,
                  communityName,
                  message: `"${communityName}" has been deleted by the admin`,
                },
              );
            }
            await createNotification({
              userId: member.userId,
              type: "community_deleted",
              title: "Community Deleted",
              message: `"${communityName}" has been deleted by the admin`,
              data: { communityId },
            });
          }
        }

        // 5. DIRECT_CHAT_REQUESTED
        if (eventType === "DIRECT_CHAT_REQUESTED") {
          const { chatId, fromUserId, fallbackName, toUserId, requestMessage } =
            payload;

          const infoMap = await getUsersByIds([fromUserId]);
          const info = infoMap[String(fromUserId)];
          const senderName = info?.fullName ?? fallbackName;

          if (io) {
            io.to(`user:${toUserId}`).emit("direct_chat_request", {
              chatId,
              fromUserId,
              fromUsername: senderName,
              from: {
                userId: fromUserId,
                fullName: info?.fullName ?? null,
                profilePicture: info?.profilePicture ?? null,
                age: info?.age ?? null,
                gender: info?.gender ?? null,
                designation: info?.designation ?? null,
                interests: info?.interests ?? [],
              },
              requestMessage,
              message: `${senderName} sent you a chat request`,
            });
          }

          await createNotification({
            userId: toUserId,
            type: "direct_chat_request",
            title: "New Chat Request",
            message: `${senderName} wants to chat with you`,
            data: { chatId, fromUserId },
          });

          await sendChatRequestEmail(toUserId, senderName);
        }

        // ============================================
        // 6. DIRECT_CHAT_RESPONDED
        // ============================================
        if (eventType === "DIRECT_CHAT_RESPONDED") {
          const { chatId, responderId, requesterId, fallbackName, action } =
            payload;

          const infoMap = await getUsersByIds([responderId]);
          const info = infoMap[String(responderId)];
          const responderName = info?.fullName ?? fallbackName;

          if (io) {
            io.to(`user:${requesterId}`).emit(
              action === "accepted"
                ? "direct_chat_accepted"
                : "direct_chat_rejected",
              {
                chatId,
                fromUsername: responderName,
                from: {
                  userId: responderId,
                  fullName: info?.fullName ?? null,
                  profilePicture: info?.profilePicture ?? null,
                  age: info?.age ?? null,
                  gender: info?.gender ?? null,
                  designation: info?.designation ?? null,
                  interests: info?.interests ?? [],
                },
                message:
                  action === "accepted"
                    ? `${responderName} accepted your chat request`
                    : `${responderName} rejected your chat request`,
              },
            );
          }

          await createNotification({
            userId: requesterId,
            type:
              action === "accepted"
                ? "direct_chat_accepted"
                : "direct_chat_rejected",
            title:
              action === "accepted"
                ? "Chat Request Accepted!"
                : "Chat Request Rejected",
            message:
              action === "accepted"
                ? `${responderName} accepted your chat request`
                : `${responderName} rejected your chat request`,
            data: { chatId },
          });
        }

        // 7. DIRECT_CHAT_WITHDRAWN
        if (eventType === "DIRECT_CHAT_WITHDRAWN") {
          const { chatId, withdrawerId, withdrawerName, otherUserId } = payload;

          if (io) {
            io.to(`user:${otherUserId}`).emit("direct_chat_withdrawn", {
              chatId,
              byUserId: withdrawerId,
              byUsername: withdrawerName,
              message: `${withdrawerName} withdrew the chat`,
            });
          }
        }

        // 8. USER_PRESENCE_CHANGED (From Gateway Socket)
        if (eventType === "USER_PRESENCE_CHANGED") {
          const { userId, status, lastSeenAt } = payload;
          const participantUserIds =
            await directChatService.getDirectChatParticipantIds(userId);

          if (io) {
            for (const participantUserId of participantUserIds) {
              io.to(`user:${participantUserId}`).emit("user_status_changed", {
                userId,
                status,
                lastSeenAt,
              });
            }
          }
        }

        // 9. DIRECT CHAT MESSAGES & READ (From Gateway Socket)
        if (eventType === "MARK_DIRECT_CHAT_READ") {
          const { chatId, userId } = payload;
          await directChatService.markDirectChatAsRead(chatId, userId);
        }

        if (eventType === "SEND_DIRECT_MESSAGE") {
          const { chatId, userId, displayName, profilePicture, text } = payload;

          const savedMsg = await directChatService.sendMessage(
            chatId,
            userId,
            displayName,
            text,
          );

          if (io) {
            io.to(`direct_${chatId}`).emit("new_direct_message", {
              messageId: savedMsg._id,
              chatId,
              senderId: userId,
              senderUsername: displayName,
              senderFullName: displayName,
              senderProfilePicture: profilePicture ?? null,
              message: savedMsg.message,
              timestamp: savedMsg.createdAt,
            });
          }
        }

        // 10. COMMUNITY CHAT MESSAGES & READ (From Gateway Socket)
        if (eventType === "MARK_COMMUNITY_CHAT_READ") {
          const { communityId, userId } = payload;
          await communityService.markCommunityChatAsRead(communityId, userId);
        }

        if (eventType === "SEND_COMMUNITY_MESSAGE") {
          const { communityId, userId, displayName, profilePicture, text } =
            payload;

          const savedMsg = await communityService.sendMessage(
            communityId,
            userId,
            displayName,
            text,
          );

          if (io) {
            io.to(`community_${communityId}`).emit("new_community_message", {
              messageId: savedMsg._id,
              communityId,
              senderId: userId,
              senderUsername: displayName,
              senderFullName: displayName,
              senderProfilePicture: profilePicture ?? null,
              message: savedMsg.message,
              timestamp: savedMsg.createdAt,
            });
          }
        }

        // ... existing event handlers

        // Rule: personal data → delete; user ki banayi communities → rakho, anonymize;
        // dusron ke content me user ki entry → hatao
        if (eventType === "USER_DELETED") {
          const { userId } = payload;
          const tag = `[USER_DELETED ${userId}]`;

          // 1. User ko saari communities se remove karo
          const membersPulled = await Community.updateMany(
            { "members.userId": userId },
            { $pull: { members: { userId: userId } } },
          );
          logger.info(
            `${tag} Community member entries removed: ${membersPulled.modifiedCount}`,
          );

          //    …aur pending join requests se bhi
          const requestsPulled = await Community.updateMany(
            { "joinRequests.userId": userId },
            { $pull: { joinRequests: { userId } } },
          );
          logger.info(
            `${tag} Community join requests removed: ${requestsPulled.modifiedCount}`,
          );

          // 2. User ki banayi communities — delete nahi (members ki history), sirf
          //    anonymize. isActive mat chhuo — wo members ki "My Communities" list se bhi
          //    hata deta hai. Sole-admin problem admin transfer feature se solve hogi
          const ownCommunities = await Community.updateMany(
            { "createdBy.userId": userId },
            { $set: { "createdBy.username": "Deleted User" } },
          );
          logger.info(
            `${tag} Own communities anonymized: ${ownCommunities.modifiedCount}`,
          );

          // 3. User ke saare messages ko "Deleted User" se replace kar do (Anonymize)
          // (Privacy laws ke mutabiq personal data hatana zaroori hai, message text rakh sakte ho context ke liye, ya message bhi delete kar sakte ho)
          const communityMessages = await CommunityMessage.updateMany(
            { senderId: userId },
            {
              $set: {
                senderUsername: "Deleted User",
                message:
                  "This message was removed because the user deleted their account.",
              },
            },
          );
          logger.info(
            `${tag} CommunityMessage anonymized: ${communityMessages.modifiedCount}`,
          );

          // 4. Dusron ke community messages se is user ke read receipts hatao
          const communitySeenPulled = await CommunityMessage.updateMany(
            { "seenBy.userId": userId },
            { $pull: { seenBy: { userId } } },
          );
          logger.info(
            `${tag} CommunityMessage seenBy entries removed: ${communitySeenPulled.modifiedCount}`,
          );

          // 5a. Direct chats delete nahi — dusre user ki conversation history hai.
          //     Participant entry hatao bhi nahi (dusre ko dikhna chahiye kisse baat ki thi),
          //     sirf is user ki identity anonymize. lastMessage preview bhi clear
          const directChats = await DirectChat.updateMany(
            { "participants.userId": userId },
            {
              $set: {
                "participants.$[p].username": "Deleted User",
                "participants.$[p].fullName": "Deleted User",
                lastMessage: null,
              },
            },
            { arrayFilters: [{ "p.userId": userId }] },
          );
          logger.info(
            `${tag} DirectChat participant anonymized: ${directChats.modifiedCount}`,
          );

          //     User ne jo chat requests bheji thi unka message — user ka likha free text
          const requestMessages = await DirectChat.updateMany(
            { requestedBy: userId },
            { $set: { requestMessage: null } },
          );
          logger.info(
            `${tag} DirectChat requestMessage cleared: ${requestMessages.modifiedCount}`,
          );

          // 5b. User ke direct messages anonymize
          const directMessages = await DirectMessage.updateMany(
            { senderId: userId },
            {
              $set: {
                senderUsername: "Deleted User",
                message:
                  "This message was removed because the user deleted their account.",
              },
            },
          );
          logger.info(
            `${tag} DirectMessage anonymized: ${directMessages.modifiedCount}`,
          );

          // 5c. Dusre user ke direct messages se is user ke read receipts hatao
          const directSeenPulled = await DirectMessage.updateMany(
            { "seenBy.userId": userId },
            { $pull: { seenBy: { userId } } },
          );
          logger.info(
            `${tag} DirectMessage seenBy entries removed: ${directSeenPulled.modifiedCount}`,
          );

          // 6. User ki notifications
          const notifications = await Notification.deleteMany({ userId });
          logger.info(
            `${tag} Notification deleted: ${notifications.deletedCount}`,
          );

          // 7. Redis: user cache + presence (key gateway-service/src/socket.js jaisa)
          const [cacheDeleted, presenceDeleted] = await Promise.all([
            redis.del(`user_info:${userId}`),
            redis.del(`user_status:${userId}`),
          ]);
          logger.info(
            `${tag} Redis cleared: user_info ${cacheDeleted}, user_status ${presenceDeleted}`,
          );

          logger.info(
            `Wiped out all community data for deleted user: ${userId}`,
          );
        }

        // Acknowledge the message
        message.ack();
        await markProcessed(message.id, SUBSCRIBER_CONTEXT);
        logger.info(
          `Processed community event: ${eventType} (MsgID: ${message.id})`,
        );
      } catch (err) {
        // Fail hua — claim hata do, warna retry duplicate samajh ke skip ho jayega
        await releaseProcessed(message.id, SUBSCRIBER_CONTEXT);
        handleSubscriberError(message, err, logger, SUBSCRIBER_CONTEXT);
      }
    });

    subscription.on("error", (error) => {
      logger.error("Community Pub/Sub subscription error:", {
        message: error.message,
      });
    });

    logger.info(`Community Subscriber listening on ${SUBSCRIPTION_NAME}`);
  } catch (err) {
    logger.error("Failed to start Community Subscriber:", {
      message: err.message,
    });
  }
};
