import Joi from "joi";
import { objectId, messagePagination } from "./common.js";

const chatIdParams = Joi.object({ chatId: objectId.required() });

export const sendRequestSchema = {
  body: Joi.object({
    toUserId: objectId.required(),
    toUsername: Joi.string().trim().max(50).allow("", null),
    toFullName: Joi.string().trim().max(100).allow("", null),
    requestMessage: Joi.string().trim().max(300).allow("", null),
  }),
};

export const respondSchema = {
  params: chatIdParams,
  body: Joi.object({
    action: Joi.string().valid("accepted", "rejected").required(),
  }),
};

export const historySchema = {
  params: chatIdParams,
  query: Joi.object(messagePagination),
};

export const withdrawSchema = { params: chatIdParams };

export const usersStatusSchema = {
  body: Joi.object({
    userIds: Joi.array().items(objectId).max(50).required(),
  }),
};
