export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_LOGO_DATA_URL_LENGTH = 262144;

// Canonicalize to a small raster image: no remote URL, metadata or active SVG survives.
export async function prepareWebsiteLogo(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPG or WebP image.");
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error("Choose an image smaller than 5 MB.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This image could not be opened. Try another PNG, JPG or WebP file.",
    );
  }
  try {
    if (!bitmap.width || !bitmap.height)
      throw new Error("This image has no visible size.");
    const canvas = document.createElement("canvas");
    for (const edge of [512, 384, 256, 192, 128]) {
      const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error(
          "Your browser could not prepare the logo. Try again in another browser.",
        );
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/png");
      if (
        result.startsWith("data:image/png;base64,") &&
        result.length <= MAX_LOGO_DATA_URL_LENGTH
      )
        return result;
    }
    throw new Error(
      "This logo is too detailed to upload. Try a smaller image.",
    );
  } finally {
    bitmap.close();
  }
}
