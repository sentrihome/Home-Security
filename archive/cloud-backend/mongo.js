import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error("❌ MONGO_URI not set");
}

export async function connectMongo() {
  await mongoose.connect(MONGO_URI, {
    autoIndex: true,
  });

  console.log("🟢 MongoDB connected");
}
