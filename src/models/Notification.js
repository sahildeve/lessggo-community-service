import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        // ─── Location Service — Ride events
        "ride_request_received",
        "ride_request_accepted",
        "ride_request_rejected",
        "ride_invite_received",
        "ride_invite_withdrawn",
        "ride_cancelled",
        "rider_removed",
        "rider_exited",
        "ride_ended",
        "invite_accepted",
        "invite_rejected",
        "ride_request_withdrawn",
        "ride_expired",

        // ─── Community Service — Direct Chat
        "direct_chat_request",
        "direct_chat_accepted",
        "direct_chat_rejected",
        "direct_message",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    viewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index(
  { viewedAt: 1 },
  { expireAfterSeconds: 5 * 60, sparse: true }, // sparse — null wale skip honge
);

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
