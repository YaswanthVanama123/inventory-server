const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

/**
 * Optimize and resize uploaded images
 * @param {string} filePath - Path to the uploaded image
 * @param {Object} options - Optimization options
 * @param {number} options.maxWidth - Maximum width (default: 1920)
 * @param {number} options.maxHeight - Maximum height (default: 1080)
 * @param {number} options.quality - JPEG/WebP quality (default: 80)
 * @param {string} options.format - Output format (jpeg, png, webp) (default: jpeg)
 * @returns {Promise<string>} - Path to optimized image
 */
const optimizeImage = async (filePath, options = {}) => {
  try {
    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 80,
      format = 'jpeg'
    } = options;

    const parsedPath = path.parse(filePath);
    const optimizedFileName = `${parsedPath.name}_optimized${parsedPath.ext}`;
    const optimizedPath = path.join(parsedPath.dir, optimizedFileName);

    // Get image metadata
    const metadata = await sharp(filePath).metadata();

    // Create sharp instance
    let transformer = sharp(filePath);

    // Resize if image is larger than max dimensions
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      transformer = transformer.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    // Apply format-specific optimizations
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        transformer = transformer.jpeg({ quality, progressive: true });
        break;
      case 'png':
        transformer = transformer.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        transformer = transformer.webp({ quality });
        break;
      default:
        transformer = transformer.jpeg({ quality, progressive: true });
    }

    // Save optimized image
    await transformer.toFile(optimizedPath);

    // Delete original file
    await fs.unlink(filePath);

    return optimizedPath;
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw new Error('Failed to optimize image');
  }
};

/**
 * Create thumbnail from image
 * @param {string} filePath - Path to the image
 * @param {number} width - Thumbnail width (default: 200)
 * @param {number} height - Thumbnail height (default: 200)
 * @returns {Promise<string>} - Path to thumbnail
 */
const createThumbnail = async (filePath, width = 200, height = 200) => {
  try {
    const parsedPath = path.parse(filePath);
    const thumbnailFileName = `${parsedPath.name}_thumb${parsedPath.ext}`;
    const thumbnailPath = path.join(parsedPath.dir, thumbnailFileName);

    await sharp(filePath)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 70 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  } catch (error) {
    console.error('Error creating thumbnail:', error);
    throw new Error('Failed to create thumbnail');
  }
};

/**
 * Validate image file type
 * @param {string} mimetype - File mimetype
 * @returns {boolean} - True if valid image type
 */
const isValidImageType = (mimetype) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validTypes.includes(mimetype);
};

module.exports = {
  optimizeImage,
  createThumbnail,
  isValidImageType
};
