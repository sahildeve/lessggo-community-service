import logger from "./logger.js";

export const success = (
  res,
  data = {},
  message = "Success",
  statusCode = 200,
) => res.status(statusCode).json({ success: true, message, data });

export const error = (
  res,
  message = "Something went wrong",
  statusCode = 500,
  errors = null,
) => {
  // Never send internal error text to clients for server errors (COMM-25).
  // Log the real message, return a safe one.
  if (statusCode >= 500) {
    logger.error("Server error response", { status: statusCode, message });
    message =
      statusCode === 503
        ? "Service temporarily unavailable. Please try again."
        : "Something went wrong. Please try again.";
  }
  return res
    .status(statusCode)
    .json({ success: false, message, ...(errors && { errors }) });
};
