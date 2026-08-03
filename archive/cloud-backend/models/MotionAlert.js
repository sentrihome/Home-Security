import mongoose from "mongoose";

const MotionAlertSchema = new mongoose.Schema({
  /** Device that triggered the alert. */
  deviceId: { type: String, required: true, index: true },

  /** Resolved from the Device collection on creation. */
  ownerEmail: { type: String, index: true },

  /** Optional: ID of the Event (clip) captured alongside the motion. */
  eventId: { type: String, default: null },

  /** pending → the user has not yet responded; acknowledged → responded. */
  status: {
    type: String,
    enum: ["pending", "acknowledged"],
    default: "pending",
    index: true,
  },

  /** What the user chose when acknowledging. */
  action: {
    type: String,
    enum: ["was_me", "not_me", null],
    default: null,
  },

  /**
   * When "was_me" is chosen, suppress further alerts until this time.
   * Server-side cooldown: GET /api/motion/latest respects this field.
   */
  cooldownUntil: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now, index: true },
});

export const MotionAlert = mongoose.model("MotionAlert", MotionAlertSchema);
