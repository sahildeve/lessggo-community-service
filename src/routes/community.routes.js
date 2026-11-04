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

// ─── Community Routes (validated, COMM-15)
router.get("/search", protect, validate(searchSchema), searchCommunities);
router.get("/my-communities", protect, getMyCommunitites);
router.get("/notifications", protect, getNotifications);
router.get("/notifications/count", protect, getNotificationCount);

// Community join requests
router.get(
  "/:communityId/join-requests",
  protect,
  validate(communityIdSchema),
  getJoinRequests,
);
router.patch(
  "/:communityId/join-requests/:userId",
  protect,
  validate(respondJoinRequestSchema),
  respondToJoinRequest,
);

router.post("/", protect, validate(createCommunitySchema), createCommunity);
router.get("/:communityId", protect, validate(communityIdSchema), getCommunity);
router.post(
  "/:communityId/join",
  protect,
  validate(communityIdSchema),
  joinCommunity,
);
router.delete(
  "/:communityId/leave",
  protect,
  validate(communityIdSchema),
  leaveCommunity,
);
router.delete(
  "/:communityId",
  protect,
  validate(communityIdSchema),
  deleteCommunity,
);
router.get(
  "/:communityId/messages",
  protect,
  validate(communityMessagesSchema),
  getCommunityMessages,
);

export default router;
