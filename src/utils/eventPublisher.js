import pubsub from "../config/pubsub.js";
import logger from "./logger.js";

const TOPIC_NAME = process.env.COMMUNITY_EVENTS_TOPIC || "community-events";

export const publishEvent = async (eventType, payload) => {
  try {
    const dataBuffer = Buffer.from(JSON.stringify({ eventType, payload }));
    const messageId = await pubsub.topic(TOPIC_NAME).publishMessage({ data: dataBuffer });
    logger.info(`Event published: ${eventType} (MsgID: ${messageId})`);
    return messageId;
  } catch (err) {
    logger.error(`Failed to publish event ${eventType}:`, { message: err.message });
  }
};