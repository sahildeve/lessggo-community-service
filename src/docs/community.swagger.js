export const communitySwaggerDocs = {
  "/api/community": {
    post: {
      summary: "Create a new community",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "city"],
              properties: {
                name: { type: "string", example: "Delhi Commuters" },
                description: {
                  type: "string",
                  example: "Daily commuters from Delhi to Noida",
                },
                city: { type: "string", example: "Delhi" },
                isPrivate: { type: "boolean", example: false },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Community created successfully" },
        401: { description: "Unauthorized" },
        422: { description: "Validation failed" },
      },
    },
  },

  "/api/community/my-communities": {
    get: {
      summary: "Get all communities joined by current user",
      tags: ["Community"],
      unreadCount: { type: "integer", example: 2 },
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "My communities fetched successfully" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/api/community/search": {
    get: {
      summary: "Search communities by city or name",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "city",
          in: "query",
          schema: { type: "string", example: "Delhi" },
        },
        {
          name: "search",
          in: "query",
          schema: { type: "string", example: "commuters" },
        },
        { name: "page", in: "query", schema: { type: "integer", example: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", example: 20 },
        },
      ],
      responses: {
        200: { description: "Communities fetched successfully" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/api/community/{communityId}": {
    get: {
      summary: "Get community details",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "communityId",
          in: "path",
          required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
      ],
      responses: {
        200: { description: "Community fetched successfully" },
        401: { description: "Unauthorized" },
        404: { description: "Community not found" },
      },
    },
    delete: {
      summary: "Delete a community — only creator can delete",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "communityId",
          in: "path",
          required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
      ],
      responses: {
        200: { description: "Community deleted successfully" },
        403: { description: "Only creator can delete" },
        404: { description: "Community not found" },
      },
    },
  },

  "/api/community/{communityId}/join": {
    post: {
      summary:
        "Join a community (public = direct join, private = send request)",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "communityId",
          in: "path",
          required: true,
          schema: {
            type: "string",
            example: "6a34aa15f585c7dfc43336a4",
          },
        },
      ],
      responses: {
        200: {
          description: "Joined successfully or join request sent",
        },
        400: {
          description: "Community full or invalid request",
        },
        404: {
          description: "Community not found",
        },
        409: {
          description: "Already member or request already sent",
        },
      },
    },
  },

  "/api/community/{communityId}/join-requests": {
  get: {
    summary: "Get pending join requests (admin only)",
    tags: ["Community"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "communityId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          example: "6a34aa15f585c7dfc43336a4",
        },
      },
    ],
    responses: {
      200: {
        description: "Join requests fetched successfully",
      },
      403: {
        description: "Only admin can view join requests",
      },
      404: {
        description: "Community not found",
      },
    },
  },
},

  "/api/community/{communityId}/leave": {
    delete: {
      summary: "Leave a community",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "communityId",
          in: "path",
          required: true,
          schema: { type: "string", example: "6a34aa15f585c7dfc43336a4" },
        },
      ],
      responses: {
        200: { description: "Left community successfully" },
        404: { description: "Community not found" },
      },
    },
  },

  "/api/community/{communityId}/join-requests/{userId}": {
  patch: {
    summary: "Accept or reject a join request (admin only)",
    tags: ["Community"],
    security: [{ bearerAuth: [] }],
    parameters: [
      {
        name: "communityId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          example: "6a34aa15f585c7dfc43336a4",
        },
      },
      {
        name: "userId",
        in: "path",
        required: true,
        schema: {
          type: "string",
          example: "687ab12345f585c7dfc43336",
        },
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
      200: {
        description: "Request processed successfully",
      },
      400: {
        description: "Invalid action",
      },
      403: {
        description: "Only admin can accept/reject requests",
      },
      404: {
        description: "Join request not found",
      },
    },
  },
},

  "/api/community/{communityId}/messages": {
    get: {
      summary: "Get community messages — only members can access",
      tags: ["Community"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "communityId",
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
        200: { description: "Messages fetched successfully" },
        403: { description: "Only members can view messages" },
        404: { description: "Community not found" },
      },
    },
  },
};
