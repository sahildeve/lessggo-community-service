import { Router } from "express";
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

// ─── Direct Chat Routes
router.post("/request", protect, sendChatRequest);
router.patch("/request/:chatId", protect, respondToChatRequest); //request bhejra h uski id and recived user id
router.get("/history/:chatId", protect, getChatHistory);
router.get("/my-chats", protect, getUserChats);
router.get("/unread-count", protect, getUnreadCount);
router.get("/pending-requests", protect, getPendingRequests);
router.patch("/:chatId/withdraw", protect, withdrawDirectChatRequest);
router.post("/users-status", protect, getUsersStatus);

export default router;
