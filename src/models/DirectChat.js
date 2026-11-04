import mongoose from "mongoose";

const directChatSchema = new mongoose.Schema(
  {
    // ─── Dono users
    participants: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        username: { type: String, default: null },
        fullName: {
          type: String,
          default: null,
        },
      },
    ],

    // ─── Request status
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked", "ended"],
      default: "pending",
    },

    // Soft leave (COMM-13): who ended an accepted chat and when.
    // Messages are kept for safety reports instead of being deleted.
    endedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    endedAt: { type: Date, default: null },

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
// Any-position participant lookups: my-chats, room join check, presence (COMM-06)
directChatSchema.index({
  "participants.userId": 1,
  status: 1,
  lastMessageAt: -1,
});
directChatSchema.index({ requestedBy: 1, status: 1 });

const DirectChat = mongoose.model("DirectChat", directChatSchema);
export default DirectChat;
