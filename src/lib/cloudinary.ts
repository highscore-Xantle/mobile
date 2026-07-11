// Unsigned image upload to Cloudinary. Cloud name + upload preset are public
// (EXPO_PUBLIC_*), so the upload happens directly from the client — no secret,
// no backend hop. Returns the hosted https URL to store in profiles.avatar_url.
import { Platform } from 'react-native';

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/**
 * Uploads a local image (file:// URI on native, blob:/data: URL on web — both
 * come from the image picker) to Cloudinary and returns the secure hosted URL.
 * Throws on misconfiguration or upload failure.
 */
export async function uploadImage(localUri: string, folder = 'avatars'): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary is not configured (EXPO_PUBLIC_CLOUDINARY_* missing).');
  }

  const form = new FormData();
  if (Platform.OS === 'web') {
    // The browser's FormData stringifies a plain object to "[object Object]",
    // which Cloudinary rejects with "Unsupported source URL". It needs a real
    // Blob, so resolve the picker's blob:/data: URL into one first.
    const blob = await (await fetch(localUri)).blob();
    form.append('file', blob, 'upload.jpg');
  } else {
    // React Native's FormData accepts a { uri, name, type } file object.
    form.append('file', { uri: localUri, name: 'upload.jpg', type: 'image/jpeg' } as any);
  }
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok || !json.secure_url) {
    throw new Error(json?.error?.message ?? 'Image upload failed. Please try again.');
  }
  return json.secure_url as string;
}
