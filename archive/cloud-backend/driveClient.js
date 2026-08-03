import fs from "fs";
import { google } from "googleapis";

const TOKEN_PATH = "./tokens.json";

export function getDriveClient() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error("Drive not connected");
  }

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH));
  const auth = new google.auth.OAuth2();
  auth.setCredentials(tokens);

  return google.drive({ version: "v3", auth });
}