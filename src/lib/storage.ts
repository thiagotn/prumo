// Cloudflare R2, holding the clinical photos (ADR 0011).
//
// The bucket is private: no custom domain, no r2.dev, no public proxy. The only way to
// read an object is a signed URL this module issues, after the caller has already been
// authorised. Bytes never pass through the pod — the browser PUTs straight to R2 — which
// also sidesteps the tunnel's request size ceiling.
//
// Configuration is the five variables the cluster provides, and nothing else:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY  (secret prumo-r2)
//   R2_BUCKET, R2_SIGNED_URL_TTL                           (ConfigMap)
import 'server-only';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** How long an upload URL is good for. Short: it is handed out one photo at a time. */
const UPLOAD_TTL_SECONDS = 300;

/** Fallback when R2_SIGNED_URL_TTL is absent. The cluster sets 120. */
const DEFAULT_READ_TTL_SECONDS = 120;

export type StorageConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  readTtlSeconds: number;
};

/**
 * Reads the configuration, or returns null when it is absent.
 *
 * Null rather than throwing on purpose: development and CI have no R2, and the rest of
 * the application has to keep working there. The photo screens say the storage is not
 * configured instead of failing to render.
 */
export function storageConfig(): StorageConfig | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  const ttl = Number(process.env.R2_SIGNED_URL_TTL);
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    readTtlSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_READ_TTL_SECONDS,
  };
}

export function storageConfigured(): boolean {
  return storageConfig() !== null;
}

let cached: { client: S3Client; config: StorageConfig } | null = null;

function client(): { client: S3Client; config: StorageConfig } {
  const config = storageConfig();
  if (!config) {
    throw new Error(
      'R2 is not configured: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET.',
    );
  }
  if (cached && cached.config.accountId === config.accountId) return cached;

  cached = {
    config,
    client: new S3Client({
      // R2 ignores the region but the SDK insists on one.
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
  return cached;
}

/**
 * A presigned PUT for the browser to upload straight to R2.
 *
 * The content type is pinned into the signature, so the URL cannot be reused to upload
 * something other than an image.
 */
export async function signUpload(key: string, contentType: string): Promise<{ url: string; expiresIn: number }> {
  const { client: s3, config } = client();
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );
  return { url, expiresIn: UPLOAD_TTL_SECONDS };
}

/** A presigned GET, valid for R2_SIGNED_URL_TTL seconds. */
export async function signDownload(key: string): Promise<string> {
  const { client: s3, config } = client();
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucket, Key: key }), {
    expiresIn: config.readTtlSeconds,
  });
}

export type ObjectHead = { contentType: string | null; byteSize: number };

/**
 * What R2 actually received. Called before a photo is marked ready: the presigned PUT
 * pins the content type, but the size is only knowable afterwards, and an upload that
 * never completed leaves no object at all.
 */
export async function headObject(key: string): Promise<ObjectHead | null> {
  const { client: s3, config } = client();
  try {
    const result = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return {
      contentType: result.ContentType ?? null,
      byteSize: Number(result.ContentLength ?? 0),
    };
  } catch (error) {
    const name = (error as { name?: string }).name;
    if (name === 'NotFound' || name === 'NoSuchKey') return null;
    throw error;
  }
}

/**
 * Deletes objects, a thousand at a time — the API's limit per call.
 *
 * Used when a patient is erased: the database rows cascade, but the bytes in the bucket
 * do not, and a photo that outlives the record it belonged to is exactly what an erasure
 * request is about (ADR 0011).
 */
export async function deleteObjects(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const { client: s3, config } = client();

  let deleted = 0;
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(
        `R2 refused to delete ${result.Errors.length} object(s): ${result.Errors[0]?.Code}`,
      );
    }
    deleted += batch.length;
  }
  return deleted;
}

/**
 * Every key under a prefix. Used to sweep a patient's folder, so an erasure catches
 * objects the database never knew about — an upload that was signed but never confirmed
 * still leaves bytes behind.
 */
export async function listKeys(prefix: string): Promise<string[]> {
  const { client: s3, config } = client();
  const keys: string[] = [];
  let token: string | undefined;

  do {
    const result = await s3.send(
      new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const item of result.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token);

  return keys;
}
