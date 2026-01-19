import { env } from "@/env.mjs";
import { DeleteObjectCommand, PutObjectCommand, S3 } from "@aws-sdk/client-s3";

const s3Client = new S3({
  forcePathStyle: false,
  endpoint: env.DO_SPACES_ENDPOINT_URL,
  region: "blr1",
  credentials: {
    accessKeyId: env.DO_SPACES_ACCESS_KEY,
    secretAccessKey: env.DO_SPACES_SECRET_KEY,
  },
});

// Helper function to convert file to ArrayBuffer
const fileToArrayBuffer = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Store the file in the S3 bucket
export const storeInS3 = async (file) => {
  let buffer;
  if (file instanceof Blob) {
    buffer = await file.arrayBuffer();
  } else if (typeof file === "object" && file.path) {
    const response = await fetch(file.path);
    const blob = await response.blob();
    buffer = await fileToArrayBuffer(blob);
  } else {
    throw new Error("Invalid file type");
  }

  // Extract just the filename (remove folder path if present)
  const getBasename = (name) => {
    if (!name) return null;
    // Handle both forward and backslash paths
    const lastSlash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
    return lastSlash >= 0 ? name.substring(lastSlash + 1) : name;
  };

  // Sanitize filename
  const sanitizeFilename = (name) => {
    const lastDotIndex = name.lastIndexOf(".");
    const base = lastDotIndex === -1 ? name : name.slice(0, lastDotIndex);
    const ext = lastDotIndex === -1 ? "" : name.slice(lastDotIndex);
    const safeBase = base
      .replace(/[^a-zA-Z0-9-_ ]+/g, "")
      .replace(/\s+/g, "-");
    return `${safeBase}${ext}`;
  };

  const originalFileName = getBasename(file.name) || `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const safeOriginalName = sanitizeFilename(originalFileName);
  const filename = `${Date.now()}-${safeOriginalName}`;

  const data = await s3Client.send(
    new PutObjectCommand({
      Bucket: env.DO_SPACES_NAME,
      Key: filename,
      Body: Buffer.from(buffer),
      ACL: "public-read",
    })
  );

  // Ensure URL uses encoded key
  const encodedKey = encodeURIComponent(filename);
  return `https://${env.DO_SPACES_NAME}.${env.DO_SPACES_ENDPOINT}/${encodedKey}`;
};

// Delete the file
export const deleteFromS3 = async (url) => {
  const filename = url.split("/").pop();
  const data = await s3Client.send(
    new DeleteObjectCommand({
      Bucket: env.DO_SPACES_NAME,
      Key: filename,
    })
  );
};

