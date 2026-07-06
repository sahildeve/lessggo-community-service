import mongoose from "mongoose";

const directChatSchema = new mongoose.Schema(
  {
    // ─── Dono users
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        username: { type: String, required: true },
        fullName: {
          type: String,
          default: null,
        },
      },
    ],

    // ─── Request status
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
    },

    // ─── Kisne request bheja
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // add message with request
    requestMessage: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    lastMessage: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Ensure ek user doosre ko ek hi baar request kar sake
directChatSchema.index(
  { "participants.0.userId": 1, "participants.1.userId": 1 },
  { unique: true },
);

const DirectChat = mongoose.model("DirectChat", directChatSchema);
export default DirectChat;
