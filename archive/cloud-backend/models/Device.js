import mongoose from "mongoose";

/**
 * Links a device (e.g. Pi) to a user so uploads from that device are attributed to them.
 */
const DeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  ownerEmail: {
    type: String,
    required: true,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export const Device = mongoose.model("Device", DeviceSchema);
