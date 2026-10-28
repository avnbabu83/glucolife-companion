// Browser-side photo resize before upload: longest side 1568 px, JPEG quality 0.85.
// Keeps uploads small and makes iPhone photos usable by the photo analysis.

export const MAX_SIDE = 1568;

/** Target size that keeps the aspect ratio and fits MAX_SIDE (never upscales). */
export function fitSize(width, height, maxSide = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Returns a JPEG File resized with a canvas. Falls back to the original file if decoding fails. */
export async function resizeImage(file, maxSide = MAX_SIDE, quality = 0.85) {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitSize(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
