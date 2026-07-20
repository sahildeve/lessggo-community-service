import mongoose from "mongoose";

const communitySchema = new mongoose.Schema(
  {
    // ─── Community info
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      trim: true,
      // index: true,
    },

    // ─── Owner
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, required: true },
      username: { type: String, required: true },
    },

    // ─── Members
    members: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        username: { type: String },
        joinedAt: { type: Date, default: Date.now },
        role: { type: String, enum: ["admin", "member"], default: "member" },
        status: {
          type: String,
          enum: ["active", "pending"],
          default: "active",
        },
      },
    ],
    // ─── Join Requests (private community)
    joinRequests: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, required: true },
        username: { type: String },
        requestedAt: { type: Date, default: Date.now },
      },
    ],

    // ─── Settings
    isPrivate: { type: Boolean, default: false },
    maxMembers: { type: Number, default: 100 },
    isActive: { type: Boolean, default: true },

    lastMessage: { type: String, default: null },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true },
);

communitySchema.index({ city: 1 });
communitySchema.index({ "createdBy.userId": 1 });
communitySchema.index({ name: "text", description: "text" }); // search ke liye

const Community = mongoose.model("Community", communitySchema);
export default Community;
