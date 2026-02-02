const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;


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

    
    const metadata = await sharp(filePath).metadata();

    
    let transformer = sharp(filePath);

    
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      transformer = transformer.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    
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

    
    await transformer.toFile(optimizedPath);

    
    await fs.unlink(filePath);

    return optimizedPath;
  } catch (error) {
    console.error('Error optimizing image:', error);
    throw new Error('Failed to optimize image');
  }
};


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


const isValidImageType = (mimetype) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  return validTypes.includes(mimetype);
};

module.exports = {
  optimizeImage,
  createThumbnail,
  isValidImageType
};
