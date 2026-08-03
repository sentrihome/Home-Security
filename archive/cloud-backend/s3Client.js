import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Validate required environment variables
const requiredEnvVars = ["AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET_NAME"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

/**
 * Upload a buffer to S3 with error handling.
 * @param {string} key - S3 object key (path)
 * @param {Buffer} body - File data
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} - S3 URI (s3://bucket/key)
 */
export async function uploadToS3(key, body, contentType) {
  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    console.log(`✅ Uploaded to S3: s3://${BUCKET}/${key}`);
    return `s3://${BUCKET}/${key}`;
  } catch (err) {
    console.error(`❌ S3 upload failed for ${key}:`, err.message);
    throw new Error(`Failed to upload ${key} to S3: ${err.message}`);
  }
}

/**
 * Delete a single object from S3.
 * @param {string} key - S3 object key
 */
export async function deleteFromS3(key) {
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    console.log(`✅ Deleted from S3: ${key}`);
  } catch (err) {
    console.error(`❌ S3 delete failed for ${key}:`, err.message);
    throw new Error(`Failed to delete ${key} from S3: ${err.message}`);
  }
}

/**
 * List all objects under a prefix.
 * @param {string} prefix - S3 prefix (folder path)
 * @returns {Promise<Array>} - Array of S3 objects
 */
export async function listS3Objects(prefix) {
  try {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    }));
    console.log(`✅ Listed S3 objects under ${prefix}: ${(res.Contents || []).length} objects`);
    return res.Contents || [];
  } catch (err) {
    console.error(`❌ S3 list failed for prefix ${prefix}:`, err.message);
    throw new Error(`Failed to list objects in ${prefix}: ${err.message}`);
  }
}

/**
 * Generate a short-lived presigned GET URL (default 5 minutes).
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiration time in seconds (default 300 = 5 min)
 * @returns {Promise<string>} - Presigned URL
 */
export async function getPresignedUrl(key, expiresIn = 300) {
  try {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn }
    );
    console.log(`✅ Generated presigned URL for ${key} (expires in ${expiresIn}s)`);
    return url;
  } catch (err) {
    console.error(`❌ Presigned URL generation failed for ${key}:`, err.message);
    throw new Error(`Failed to generate presigned URL for ${key}: ${err.message}`);
  }
}

/**
 * Delete all objects older than maxAgeMs under a prefix (for cleanup).
 * @param {string} prefix - S3 prefix (folder path)
 * @param {number} maxAgeMs - Max age in milliseconds (default 10 min)
 * @returns {Promise<number>} - Number of deleted objects
 */
export async function pruneOldSegments(prefix, maxAgeMs = 10 * 60 * 1000) {
  try {
    const objects = await listS3Objects(prefix);
    const cutoff = Date.now() - maxAgeMs;
    const toDelete = objects.filter(
      (o) => o.LastModified && o.LastModified.getTime() < cutoff
    );

    if (toDelete.length > 0) {
      await Promise.all(toDelete.map((o) => deleteFromS3(o.Key)));
      console.log(`✅ Pruned ${toDelete.length} old segments from ${prefix}`);
    }
    return toDelete.length;
  } catch (err) {
    console.error(`❌ Pruning failed for ${prefix}:`, err.message);
    // Don't throw — pruning failures are non-critical
    return 0;
  }
}

export { BUCKET, s3 };