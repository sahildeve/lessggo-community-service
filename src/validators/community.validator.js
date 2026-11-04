import Joi from "joi";
import { objectId, pagination, messagePagination } from "./common.js";

const communityIdParams = Joi.object({ communityId: objectId.required() });

export const searchSchema = {
  query: Joi.object({
    city: Joi.string().trim().max(60).allow(""),
    search: Joi.string().trim().max(100).allow(""),
    ...pagination,
  }),
};

export const createCommunitySchema = {
  body: Joi.object({
    name: Joi.string().trim().min(3).max(60).required(),
    description: Joi.string().trim().max(500).allow("", null),
    city: Joi.string().trim().max(60).allow("", null),
    isPrivate: Joi.boolean().default(false),
    // A community needs at least 2 people; 500 keeps lists and unread counts fast.
    maxMembers: Joi.number().integer().min(2).max(500).default(100),
  }),
};

export const communityIdSchema = { params: communityIdParams };

export const respondJoinRequestSchema = {
  params: Joi.object({
    communityId: objectId.required(),
    userId: objectId.required(),
  }),
  // Allowed action values are still checked in the controller.
  body: Joi.object({ action: Joi.string().trim().max(20).required() }),
};

export const communityMessagesSchema = {
  params: communityIdParams,
  query: Joi.object(messagePagination),
};