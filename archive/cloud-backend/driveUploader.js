import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { getAuthorizedClient, getAuthorizedClientForUser } from "./googleAuth.js";
import { Event } from "./models/Event.js";

function getDriveClient(ownerEmail) {
  if (ownerEmail) return getAuthorizedClientForUser(ownerEmail);
  return getAuthorizedClient();
}

export async function uploadToDrive(filePath, deviceId, type = "video", ownerEmail = null) {
  const filename = path.basename(filePath);
  console.log(`📤 [Drive] Uploading: ${filename} (deviceId=${deviceId}, type=${type}, owner=${ownerEmail || "legacy"})`);

  const auth = getDriveClient(ownerEmail);
  const drive = google.drive({ version: "v3", auth });

  const mimeType = type === "thumbnail" ? "image/jpeg" : "video/mp4";

  const response = await drive.files.create({
    requestBody: {
      name: filename,
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: "id, webViewLink",
  });

  // Make file publicly accessible
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  console.log(`✅ [Drive] Uploaded: ${filename} → Drive fileId=${response.data.id}, link=${response.data.webViewLink || "(no link)"}`);
  return response.data;
}

export async function handleEventUpload(filePath, deviceId, type, ownerEmail = null) {
  let driveData;
  try {
    driveData = await uploadToDrive(filePath, deviceId, type, ownerEmail);
  } catch (err) {
    console.error(`❌ [Drive] Upload failed: ${path.basename(filePath)} — ${err.message}`);
    throw err;
  }
  
  // Find or create event record
  let event;
  if (type === "video") {
    // Check if there's already a placeholder event with thumbnail
    const existingEvent = await Event.findOne({ filename: path.basename(filePath) });
    
    if (existingEvent && existingEvent.driveFileId === "pending") {
      // Update the placeholder event with video info
      const update = {
        driveFileId: driveData.id,
        driveLink: driveData.webViewLink,
        status: "ready",
      };
      if (ownerEmail) update.ownerEmail = ownerEmail;
      event = await Event.findOneAndUpdate(
        { filename: path.basename(filePath) },
        update,
        { new: true }
      );
    } else {
      // Create new event when video is uploaded
      event = await Event.create({
        ownerEmail: ownerEmail || undefined,
        deviceId,
        filename: path.basename(filePath),
        driveFileId: driveData.id,
        driveLink: driveData.webViewLink,
        status: "ready",
      });
    }
  } else if (type === "thumbnail") {
    // Update existing event with thumbnail (find by filename without extension)
    const baseFilename = path.basename(filePath, ".jpg");
    const videoFilename = baseFilename + ".mp4";
    
    // First try to find existing event
    event = await Event.findOneAndUpdate(
      { filename: videoFilename },
      { 
        thumbnailDriveId: driveData.id,
        thumbnailUrl: driveData.webViewLink,
      },
      { new: true }
    );
    
    // If no existing event found, create a placeholder
    if (!event) {
      event = await Event.create({
        ownerEmail: ownerEmail || undefined,
        deviceId,
        filename: videoFilename, // Use the expected video filename
        driveFileId: "pending", // Will be updated when video uploads
        driveLink: "pending",
        thumbnailDriveId: driveData.id,
        thumbnailUrl: driveData.webViewLink,
        status: "uploading", // Still waiting for video
      });
    }
  }

  return event;
}
