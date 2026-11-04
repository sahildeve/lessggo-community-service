import Joi from "joi";

// Shared building blocks for request schemas (COMM-15).
export const objectId = Joi.string().hex().length(24);

export const pagination = {
  page: Joi.number().integer().min(1).max(1000).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
};

// Message history keeps its current default page size of 50.
export const messagePagination = {
  page: Joi.number().integer().min(1).max(1000).default(1),
  limit: Joi.number().integer().min(1).max(50).default(50),
};