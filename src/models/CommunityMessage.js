import mongoose from "mongoose";

const communityMessageSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    senderUsername: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    messageType: {
      type: String,
      enum: ["text", "system"],
      default: "text",
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

communityMessageSchema.index({ communityId: 1, createdAt: -1 });

const CommunityMessage = mongoose.model(
  "CommunityMessage",
  communityMessageSchema,
);
export default CommunityMessage;
