import pubsub from "../config/pubsub.js";
import logger from "../utils/logger.js";
import { createNotification } from "../utils/notification.js";
import { getUsersByIds } from "../utils/authServiceClient.js";
import { sendChatRequestEmail } from "../utils/emailNotification.js";
import * as communityService from "../services/community.service.js";

const SUBSCRIPTION_NAME =
  process.env.COMMUNITY_EVENTS_SUB || "community-events-sub";

export const startCommunitySubscriber = (io) => {
  try {
    const subscription = pubsub.subscription(SUBSCRIPTION_NAME);

    subscription.on("message", async (message) => {
      try {
        const parsedData = JSON.parse(message.data.toString());
        const { eventType, payload } = parsedData;

        // ============================================
        // 1. COMMUNITY_JOIN_REQUESTED (Pending / Active)
        // ============================================
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
            // Public Community Join
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

        // ============================================
        // 5. DIRECT_CHAT_REQUESTED
        // ============================================
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

        // 6. DIRECT_CHAT_RESPONDED
        if (eventType === "DIRECT_CHAT_RESPONDED") {
          const { chatId, responderId, requesterId, fallbackName, action } = payload;

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

        // Acknowledge the message
        message.ack();
        logger.info(
          `Processed community event: ${eventType} (MsgID: ${message.id})`,
        );
      } catch (err) {
        logger.error(
          `Error processing Community Pub/Sub message: ${err.message}`,
        );
        message.nack();
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
