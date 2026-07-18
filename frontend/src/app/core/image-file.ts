const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

export function imageFileError(file: File | null): string {
  if (!file) return '';
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.has(file.type)) {
    return 'Select a JPG, JPEG, or PNG file.';
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return 'The image size cannot exceed 2 MB.';
  }
  return '';
}
