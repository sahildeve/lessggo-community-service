import mongoose from "mongoose";

const directMessageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DirectChat",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderUsername: {
      type: String,
      default: null,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    isDeleted: { type: Boolean, default: false },
    seenBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId },
        seenAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

directMessageSchema.index({ chatId: 1, createdAt: -1 });
// Unread count queries ke liye
directMessageSchema.index({ chatId: 1, senderId: 1, "seenBy.userId": 1 });

const DirectMessage = mongoose.model("DirectMessage", directMessageSchema);
export default DirectMessage;
