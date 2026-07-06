import { Router } from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  createCommunity,
  joinCommunity,
  leaveCommunity,
  deleteCommunity,
  getCommunity,
  searchCommunities,
  getCommunityMessages,
  getMyCommunitites,
  getJoinRequests,
  respondToJoinRequest,
} from "../controllers/community.controller.js";
import {
  getNotifications,
  getNotificationCount,
} from "../controllers/notification.controller.js";

const router = Router();

// ─── Community Routes
router.get("/search", protect, searchCommunities);
router.get("/my-communities", protect, getMyCommunitites);
router.get("/notifications", protect, getNotifications);
router.get("/notifications/count", protect, getNotificationCount);

// Community join requests
router.get("/:communityId/join-requests", protect, getJoinRequests);
router.patch(
  "/:communityId/join-requests/:userId",
  protect,
  respondToJoinRequest,
);

router.post("/", protect, createCommunity);
router.get("/:communityId", protect, getCommunity);
router.post("/:communityId/join", protect, joinCommunity);
router.delete("/:communityId/leave", protect, leaveCommunity);
router.delete("/:communityId", protect, deleteCommunity);
router.get("/:communityId/messages", protect, getCommunityMessages);

export default router;
