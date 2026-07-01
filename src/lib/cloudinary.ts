/**
 * cloudinary.ts — Reusable Cloudinary upload service.
 *
 * Responsibilities:
 *   • Image picking (via expo-image-picker)
 *   • Client-side validation (size, type)
 *   • Upload to Cloudinary unsigned endpoint
 *   • Response normalisation
 *   • Typed errors with retryable flag
 *
 * Usage (from any screen or hook):
 *   import { pickImage, uploadImage } from '../lib/cloudinary';
 *   const uri = await pickImage();
 *   if (uri) {
 *     const result = await uploadImage(uri);
 *     console.log(result.url); // store in profiles.avatar_url
 *   }
 */
import * as ImagePicker from 'expo-image-picker';

// ─── Config ──────────────────────────────────────────────────────────────────

const CLOUD_NAME   = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudinaryUploadResult {
  url: string;
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
}

export class CloudinaryError extends Error {
  /** true = caller may offer a Retry; false = fatal (e.g. invalid preset) */
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'CloudinaryError';
    this.retryable = retryable;
  }
}

// ─── Image Picker ─────────────────────────────────────────────────────────────

/**
 * Opens the native image library. Returns the local file URI on success,
 * or null if the user cancelled. Automatically requests permissions.
 */
export async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new CloudinaryError(
      'Photo library access was denied. Enable it in your device settings.',
      false,
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });

  if (result.canceled || result.assets.length === 0) return null;

  const asset = result.assets[0];

  // Size guard (fileSize may be undefined for some platforms)
  if (asset.fileSize && asset.fileSize > MAX_BYTES) {
    throw new CloudinaryError(
      `Image is too large (max 5 MB). Please choose a smaller photo.`,
      false,
    );
  }

  return asset.uri;
}

// ─── Upload ───────────────────────────────────────────────────────────────────

/**
 * Uploads an image URI to Cloudinary using an unsigned upload preset.
 * Returns a normalised result containing the public CDN URL.
 */
export async function uploadImage(
  uri: string,
  folder = 'xantle/avatars',
): Promise<CloudinaryUploadResult> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new CloudinaryError(
      'Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and ' +
      'EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in your .env file.',
      false,
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  // React Native requires FormData to be built with the file descriptor object.
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'avatar.jpg' } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);

  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', body: form });
  } catch {
    throw new CloudinaryError('Upload failed — check your internet connection.');
  }

  if (!response.ok) {
    let msg = `Upload failed (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (body?.error?.message) msg = body.error.message;
    } catch { /* ignore parse error */ }
    // 4xx errors (bad preset, etc.) are not retryable
    throw new CloudinaryError(msg, response.status >= 500);
  }

  const data = await response.json();

  return {
    url:       data.url        as string,
    secureUrl: data.secure_url as string,
    publicId:  data.public_id  as string,
    width:     data.width      as number,
    height:    data.height     as number,
    format:    data.format     as string,
  };
}
