export const directChatSwaggerDocs = {

  "/api/direct-chat/request": {
    post: {
      summary: "Send a chat request to another user",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["toUserId", "toUsername"],
              properties: {
                toUserId:       { type: "string", example: "6a34a9c58bd7555188343ba7" },
                toUsername:     { type: "string", example: "Priyansh Sharma" },
                requestMessage: { type: "string", example: "Hey! Can we chat about the ride?" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Chat request sent successfully" },
        400: { description: "Request already sent" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/api/direct-chat/request/{chatId}": {
    patch: {
      summary: "Accept or reject a chat request",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "chatId", in: "path", required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["action"],
              properties: {
                action: {
                  type: "string",
                  enum: ["accepted", "rejected"],
                  example: "accepted",
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Chat request accepted/rejected" },
        403: { description: "Not authorized to respond" },
        404: { description: "Chat request not found" },
      },
    },
  },

  "/api/direct-chat/history/{chatId}": {
    get: {
      summary: "Get chat message history",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "chatId", in: "path", required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
        { name: "page",  in: "query", schema: { type: "integer", example: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", example: 50 } },
      ],
      responses: {
        200: { description: "Chat history fetched" },
        403: { description: "Not a participant" },
        404: { description: "Chat not found" },
      },
    },
  },

  "/api/direct-chat/my-chats": {
    get: {
      summary: "Get all chats of current user",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Chats fetched successfully" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/api/direct-chat/{chatId}/withdraw": {
  patch: {
    summary: "Withdraw a pending request or leave an accepted chat",
    tags: ["Direct Chat"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "chatId",
        in: "path",
        required: true,
        schema: { type: "string", example: "6a4b929a6b74ea5937310ea2" },
      },
    ],
    responses: {
      200: {
        description: "Chat withdrawn successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                success: { type: "boolean", example: true },
                message: { type: "string", example: "Chat withdrawn successfully" },
              },
            },
          },
        },
      },
      403: { description: "You are not a participant of this chat" },
      404: { description: "Chat not found" },
      401: { description: "Unauthorized" },
    },
  },
},

  "/api/direct-chat/pending-requests": {
    get: {
      summary: "Get all pending chat requests received by current user",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Pending requests fetched" },
        401: { description: "Unauthorized" },
      },
    },
  },
};