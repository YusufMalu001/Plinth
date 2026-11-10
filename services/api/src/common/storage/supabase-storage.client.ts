import { createClient, SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from '../../config';

export interface UploadableFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

let client: SupabaseClient | undefined;
let bucketReady: Promise<void> | null = null;

function getSupabaseStorageClient(): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      'Supabase Storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable GRN attachment uploads.'
    );
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: WebSocket as any }
    });
  }
  return client;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureStorageBucket(storage: SupabaseClient): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data: buckets, error: listError } = await storage.storage.listBuckets();
      if (listError) throw new Error(`Unable to inspect Supabase Storage buckets: ${listError.message}`);
      if (buckets?.some(bucket => bucket.name === config.supabaseStorageBucket)) return;
      const { error: createError } = await storage.storage.createBucket(config.supabaseStorageBucket, { public: false, fileSizeLimit: 10485760 });
      // Two API workers can initialise concurrently; an already-exists response
      // is safe, while all other errors must be surfaced to the caller.
      if (createError && !/already exists|duplicate/i.test(createError.message)) {
        throw new Error(`Supabase Storage bucket "${config.supabaseStorageBucket}" is missing and could not be created: ${createError.message}`);
      }
    })().catch(error => { bucketReady = null; throw error; });
  }
  await bucketReady;
}

/**
 * Uploads a GRN attachment to a private Supabase bucket and returns a signed URL.
 * The storage path is retained by the server so fresh signed URLs can be issued on demand.
 */
export async function uploadGrnDocument(grnId: string, file: UploadableFile): Promise<{ path: string; publicUrl: string }> {
  const storage = getSupabaseStorageClient();
  await ensureStorageBucket(storage);
  const path = `grn/${grnId}/${Date.now()}-${sanitizeFileName(file.originalname)}`;

  const { error } = await storage.storage.from(config.supabaseStorageBucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false
  });
  if (error) {
    throw new Error(`Failed to upload GRN document to Supabase Storage: ${error.message}`);
  }

  // Generate a signed URL with 7 days expiration for initial response
  const { data, error: signedUrlError } = await storage.storage.from(config.supabaseStorageBucket).createSignedUrl(path, 60 * 60 * 24 * 7);
  if (signedUrlError || !data?.signedUrl) throw new Error(`Failed to create a private access URL for GRN document: ${signedUrlError?.message || 'unknown error'}`);
  return { path, publicUrl: data.signedUrl };
}

/**
 * Dynamically creates/refreshes a signed URL for a given storage path or stored URL.
 * Prevents "InvalidJWT: exp claim timestamp check failed" errors when viewing documents after initial creation.
 */
export async function createSignedUrlForPath(pathOrUrl: string, expiresIn: number = 60 * 60 * 24 * 7): Promise<string> {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey || !pathOrUrl) {
    return pathOrUrl;
  }

  try {
    const storage = getSupabaseStorageClient();
    let bucket = config.supabaseStorageBucket || 'goods-receipts';
    let path = pathOrUrl;

    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
      try {
        const url = new URL(pathOrUrl);
        const objectMatch = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)/);
        if (objectMatch && objectMatch[1] && objectMatch[2]) {
          bucket = decodeURIComponent(objectMatch[1]);
          path = decodeURIComponent(objectMatch[2]);
        } else {
          const grnMatch = url.pathname.match(/(grn\/.+)/);
          if (grnMatch && grnMatch[1]) {
            path = decodeURIComponent(grnMatch[1]);
          } else {
            return pathOrUrl;
          }
        }
      } catch {
        return pathOrUrl;
      }
    }

    const { data, error } = await storage.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data?.signedUrl) {
      if (bucket !== config.supabaseStorageBucket) {
        const fallback = await storage.storage.from(config.supabaseStorageBucket).createSignedUrl(path, expiresIn);
        if (fallback.data?.signedUrl) {
          return fallback.data.signedUrl;
        }
      }
      return pathOrUrl;
    }
    return data.signedUrl;
  } catch {
    return pathOrUrl;
  }
}

