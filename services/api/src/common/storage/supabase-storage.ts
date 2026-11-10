import { config } from '../../config';

export interface UploadedProductImage {
  path: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
}

let bucketReady: Promise<void> | null = null;

function bucketName() {
  return config.supabaseProductBucket.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function assertConfigured() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error('Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
}

async function ensureBucket() {
  assertConfigured();
  if (!bucketReady) {
    const name = bucketName();
    bucketReady = fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.supabaseServiceRoleKey}`, apikey: config.supabaseServiceRoleKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: name, name, public: true })
    }).then(async (response) => {
      if (response.ok || response.status === 409) return;
      const detail = await response.text().catch(() => '');
      // Supabase can return 400 with BucketAlreadyExists (instead of 409)
      // when another request or deployment created the bucket first.
      if (/BucketAlreadyExists|already exists|duplicate/i.test(detail)) return;
      throw new Error('Product image storage is temporarily unavailable. Please try again.');
    }).catch((error) => {
      bucketReady = null;
      throw error;
    });
  }
  return bucketReady;
}

export async function uploadProductImages(productKey: string, files: Express.Multer.File[]): Promise<UploadedProductImage[]> {
  await ensureBucket();
  const safeKey = productKey.replace(/[^a-zA-Z0-9_-]/g, '-');
  return Promise.all(files.map(async (file, index) => {
    const path = `products/${safeKey}/${Date.now()}-${index}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${bucketName()}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.supabaseServiceRoleKey}`, apikey: config.supabaseServiceRoleKey, 'Content-Type': file.mimetype, 'x-upsert': 'false' },
      body: file.buffer
    });
    if (!response.ok) {
      throw new Error(response.status === 413
        ? 'Product image is too large. Please choose an image under 5 MB.'
        : 'Product image upload failed. Please try again.');
    }
    return { path, url: `${config.supabaseUrl}/storage/v1/object/public/${bucketName()}/${path}`, fileName: file.originalname, contentType: file.mimetype, size: file.size };
  }));
}
