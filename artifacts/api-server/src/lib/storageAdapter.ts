/**
 * Unified storage adapter.
 *
 * Selects the backend at startup based on available env vars:
 *   - S3 / Tigris (Fly.io):  BUCKET_NAME + AWS_ENDPOINT_URL_S3 present
 *   - GCS (legacy):          PRIVATE_OBJECT_DIR present (requires GCS service account)
 *
 * Both backends use the same objectPath convention: /objects/uploads/<uuid>
 */

import { randomUUID } from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Readable } from "stream";
import { objectStorageClient } from "./objectStorage";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── backend detection ───────────────────────────────────────────────────────

function useS3Backend(): boolean {
  return !!(process.env.BUCKET_NAME && process.env.AWS_ENDPOINT_URL_S3);
}

// ─── S3 / Tigris backend ─────────────────────────────────────────────────────

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    region: process.env.AWS_REGION ?? "auto",
    credentials: {
      accessKeyId: (() => {
        if (!process.env.AWS_ACCESS_KEY_ID) throw new Error('AWS_ACCESS_KEY_ID is not configured');
        return process.env.AWS_ACCESS_KEY_ID;
      })(),
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  });
}

async function s3Upload(
  buffer: Buffer,
  contentType: string
): Promise<{ objectPath: string }> {
  const bucket = process.env.BUCKET_NAME!;
  const key = `objects/uploads/${randomUUID()}`;

  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return { objectPath: `/objects/uploads/${key.split("objects/uploads/")[1]}` };
}

async function s3Download(objectPath: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}> {
  const bucket = process.env.BUCKET_NAME!;
  // objectPath is /objects/uploads/<uuid> → S3 key is objects/uploads/<uuid>
  const key = objectPath.startsWith("/") ? objectPath.slice(1) : objectPath;

  const client = getS3Client();
  const resp = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  if (!resp.Body) throw new Error("Empty response from S3");

  const stream = resp.Body as NodeJS.ReadableStream;
  return {
    stream,
    contentType: resp.ContentType ?? "application/octet-stream",
    contentLength: resp.ContentLength,
  };
}

// ─── GCS backend (legacy) ────────────────────────────────────────────────────

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir;
}

async function gcsUpload(
  buffer: Buffer,
  contentType: string
): Promise<{ objectPath: string }> {
  const privateObjectDir = getPrivateObjectDir();
  const objectId = randomUUID();
  const fullPath = `${privateObjectDir}/uploads/${objectId}`;

  // Parse bucket + object name from the full GCS path (/bucket/path/…)
  const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const gcsFile = bucket.file(objectName);

  await gcsFile.save(buffer, { contentType, resumable: false });

  return { objectPath: `/objects/uploads/${objectId}` };
}

async function gcsDownload(objectPath: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}> {
  const privateObjectDir = getPrivateObjectDir();
  // objectPath = /objects/uploads/<uuid>
  const uuid = objectPath.replace(/^\/objects\/uploads\//, "");

  const fullPath = `${privateObjectDir}/uploads/${uuid}`;
  const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const gcsFile = bucket.file(objectName);

  const [exists] = await gcsFile.exists();
  if (!exists) throw new Error("Object not found");

  const [metadata] = await gcsFile.getMetadata();
  const nodeStream = gcsFile.createReadStream();

  return {
    stream: nodeStream,
    contentType: (metadata.contentType as string) ?? "application/octet-stream",
    contentLength: metadata.size ? Number(metadata.size) : undefined,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function storageUpload(
  buffer: Buffer,
  contentType: string
): Promise<{ objectPath: string }> {
  if (useS3Backend()) {
    return s3Upload(buffer, contentType);
  }
  return gcsUpload(buffer, contentType);
}

export async function storageDownload(objectPath: string): Promise<{
  stream: NodeJS.ReadableStream;
  contentType: string;
  contentLength?: number;
}> {
  if (useS3Backend()) {
    return s3Download(objectPath);
  }
  return gcsDownload(objectPath);
}

export function storageBackendName(): string {
  return useS3Backend() ? "s3" : "gcs";
}
