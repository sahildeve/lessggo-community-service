import { Router } from "express";
import { validate } from "../middlewares/validate.js";
import {
  sendRequestSchema,
  respondSchema,
  historySchema,
  withdrawSchema,
  usersStatusSchema,
} from "../validators/directChat.validator.js";
import { protect } from "../middlewares/auth.middleware.js";
import {
  sendChatRequest,
  respondToChatRequest,
  getChatHistory,
  getUserChats,
  getPendingRequests,
  withdrawDirectChatRequest,
  getUsersStatus,
  getUnreadCount,
} from "../controllers/directChat.controller.js";

const router = Router();

// ─── Direct Chat Routes (validated, COMM-15)
router.post("/request", protect, validate(sendRequestSchema), sendChatRequest);
router.patch("/request/:chatId", protect, validate(respondSchema), respondToChatRequest);
router.get("/history/:chatId", protect, validate(historySchema), getChatHistory);
router.get("/my-chats", protect, getUserChats);
router.get("/unread-count", protect, getUnreadCount);
router.get("/pending-requests", protect, getPendingRequests);
router.patch("/:chatId/withdraw", protect, validate(withdrawSchema), withdrawDirectChatRequest);
router.post("/users-status", protect, validate(usersStatusSchema), getUsersStatus);

export default router;
