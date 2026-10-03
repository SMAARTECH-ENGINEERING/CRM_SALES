import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from '../config/env.js';

// Where uploaded files live. Files are never put in MongoDB - the database
// holds only their details and a storage key.
//
// Two drivers, chosen with STORAGE_DRIVER:
//   s3     an S3-compatible object store (AWS S3, MinIO, Cloudflare R2,
//          DigitalOcean Spaces, ...) - S3_BUCKET, S3_REGION, S3_ENDPOINT,
//          S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_FORCE_PATH_STYLE
//   local  a folder on the server (UPLOAD_DIR) - for development and tests
//
// Every driver has the same three operations on a key such as
// "documents/quotation/<id>/<uuid>.pdf":
//   put(key, buffer, contentType)     get(key) -> readable stream, or null     remove(key)

// --- local folder ------------------------------------------------------------

// A relative UPLOAD_DIR is taken from the server folder, wherever the process starts.
const SERVER_ROOT = fileURLToPath(new URL('../../', import.meta.url));

function localDriver(root) {
  // Refuses anything that would land outside the folder.
  const resolve = (key) => {
    const full = path.resolve(root, key);
    return full.startsWith(root + path.sep) ? full : null;
  };
  return {
    name: 'local',
    async put(key, buffer) {
      const full = resolve(key);
      if (!full) throw new Error(`Invalid storage key: ${key}`);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buffer, { flag: 'wx' });
    },
    async get(key) {
      const full = resolve(key);
      if (!full) return null;
      try {
        await fs.access(full);
      } catch {
        return null;
      }
      return createReadStream(full);
    },
    async remove(key) {
      const full = resolve(key);
      if (full) await fs.rm(full, { force: true });
    },
  };
}

// --- S3-compatible object storage ----------------------------------------------

// `client` and `commands` can be supplied (tests); otherwise the AWS SDK is
// loaded on first use, so a local setup never needs it.
export function s3Driver(config, injected) {
  let sdk = injected;
  async function load() {
    if (sdk) return sdk;
    const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      // Without explicit keys the SDK uses its default chain (instance role, environment, ...).
      ...(config.accessKeyId ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } } : {}),
    });
    sdk = { client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand };
    return sdk;
  }
  const objectKey = (key) => (config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, '')}/${key}` : key);

  return {
    name: 's3',
    async put(key, buffer, contentType) {
      const { client, PutObjectCommand } = await load();
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: objectKey(key), Body: buffer, ContentType: contentType, ContentLength: buffer.length })
      );
    },
    async get(key) {
      const { client, GetObjectCommand } = await load();
      try {
        const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }));
        return result.Body;
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async remove(key) {
      const { client, DeleteObjectCommand } = await load();
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }));
    },
  };
}

// --- the driver in use ----------------------------------------------------------

let driver =
  env.storage.driver === 's3' ? s3Driver(env.storage.s3) : localDriver(path.resolve(SERVER_ROOT, env.uploads.dir));

// Lets tests swap the store; pass nothing to get the configured one back.
const configured = driver;
export function setStorageDriver(replacement) {
  driver = replacement ?? configured;
}

export const storageName = () => driver.name;
export const putObject = (key, buffer, contentType) => driver.put(key, buffer, contentType);
export const getObject = (key) => driver.get(key);
export const removeObject = (key) => driver.remove(key);
