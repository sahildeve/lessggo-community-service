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
                toUserId: {
                  type: "string",
                  example: "6a34a9c58bd7555188343ba7",
                },
                toUsername: { type: "string", example: "Priyansh Sharma" },
                requestMessage: {
                  type: "string",
                  example: "Hey! Can we chat about the ride?",
                },
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
          name: "chatId",
          in: "path",
          required: true,
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
          name: "chatId",
          in: "path",
          required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
        { name: "page", in: "query", schema: { type: "integer", example: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", example: 50 },
        },
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
                  message: {
                    type: "string",
                    example: "Chat withdrawn successfully",
                  },
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

  "/api/direct-chat/users-status": {
    post: {
      summary: "Get online/offline status of multiple users",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userIds"],
              properties: {
                userIds: {
                  type: "array",
                  items: { type: "string" },
                  example: [
                    "6a34a9c58bd7555188343ba7",
                    "6a421adddd99c956ec0291b9",
                  ],
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Status fetched successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      statusMap: {
                        type: "object",
                        example: {
                          "6a34a9c58bd7555188343ba7": {
                            status: "online",
                            lastSeenAt: null,
                          },
                          "6a421adddd99c956ec0291b9": {
                            status: "offline",
                            lastSeenAt: "2026-07-20T10:00:00.000Z",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "userIds array is required" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/api/direct-chat/pending-requests": {
    get: {
      summary:
        "Get all pending requests received by current user (direct chats + community joins)",
      tags: ["Direct Chat"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Pending requests fetched",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "object",
                    properties: {
                      directRequests: {
                        type: "array",
                        items: { type: "object" },
                      },
                      communityJoinRequests: {
                        type: "array",
                        description:
                          "Community join requests sent by current user",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", example: "community_join" },
                            communityId: {
                              type: "string",
                              example: "6a4b87beeb44d600d0c706d6",
                            },
                            userId: {
                              type: "string",
                              example: "6a421adddd99c956ec0291b9",
                            },
                            communityName: {
                              type: "string",
                              example: "XYZ_01",
                            },
                            requestedAt: {
                              type: "string",
                              example: "2026-07-06T10:48:16.618Z",
                            },
                          },
                        },
                      },
                      receivedCommunityJoinRequests: {
                        type: "array",
                        description:
                          "Community join requests received (current user is admin)",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", example: "community_join" },
                            communityId: {
                              type: "string",
                              example: "6a4b87beeb44d600d0c706d6",
                            },
                            communityName: {
                              type: "string",
                              example: "XYZ_01",
                            },
                            userId: {
                              type: "string",
                              example: "687ab12345f585c7dfc43336",
                            },
                            username: { type: "string", example: "sandeep123" },
                            requestedAt: {
                              type: "string",
                              example: "2026-07-06T10:48:16.618Z",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    },
  },
};
