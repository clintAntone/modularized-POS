
/**
 * Advanced Image Compression Utility v2.2
 * Optimized for high-resolution mobile photos (5MB+)
 * Standardizes sizes for Profiles vs Receipts to ensure network efficiency.
 */

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export const compressImage = async (
  file: File, 
  options: CompressionOptions = {}
): Promise<Blob> => {
  const { 
    maxWidth = 1200, 
    maxHeight = 1200, 
    quality = 0.6 
  } = options;

  // 1. Initial validation for non-image files selected via file explorer fallbacks
  // This prevents processing non-image files picked when camera intent is bypassed
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported format. Please capture a photo or select an image file.');
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Maintain Aspect Ratio while respecting both max constraints
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Hardware acceleration failed. Please try again.'));
        return;
      }
      
      // High quality image smoothing for readable receipts
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            // Final check on blob size to ensure successful encoding
            if (blob.size === 0) reject(new Error('Failed to encode image data.'));
            else resolve(blob);
          } else {
            reject(new Error('Image encoding failed.'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Corrupt image or incompatible file format.'));
    };

    img.src = url;
  });
};
