const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Upload image to ImgBB
 * @param {string} filePath - Path to the image file
 * @param {string} fileName - Name of the file
 * @returns {Promise<Object>} Upload result with image URLs
 */
const uploadToImgBB = async (filePath, fileName) => {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    const apiUrl = process.env.IMGBB_API_URL || 'https://api.imgbb.com/1/upload';

    if (!apiKey) {
      throw new Error('ImgBB API key not configured');
    }

    // Read file and convert to base64
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');

    // Create form data
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('image', base64Image);
    formData.append('name', fileName);

    // Upload to ImgBB
    const response = await axios.post(apiUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      params: {
        key: apiKey,
      },
    });

    if (!response.data || !response.data.success) {
      throw new Error('ImgBB upload failed');
    }

    const { data } = response.data;

    // Return structured response
    return {
      success: true,
      data: {
        id: data.id,
        title: data.title,
        url: data.url,
        display_url: data.display_url,
        delete_url: data.delete_url,
        width: data.width,
        height: data.height,
        size: data.size,
        time: data.time,
        expiration: data.expiration,
        filename: data.image.filename,
        extension: data.image.extension,
        mime: data.image.mime,
        thumb_url: data.thumb?.url,
        medium_url: data.medium?.url,
      },
    };
  } catch (error) {
    console.error('ImgBB upload error:', error.response?.data || error.message);

    // Try backup API key if primary fails
    if (process.env.IMGBB_API_KEY_BACKUP && !error.retried) {
      try {
        const backupApiKey = process.env.IMGBB_API_KEY_BACKUP;
        const apiUrl = process.env.IMGBB_API_URL || 'https://api.imgbb.com/1/upload';

        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');

        const formData = new FormData();
        formData.append('key', backupApiKey);
        formData.append('image', base64Image);
        formData.append('name', fileName);

        const response = await axios.post(apiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
          params: {
            key: backupApiKey,
          },
        });

        if (response.data && response.data.success) {
          const { data } = response.data;
          return {
            success: true,
            data: {
              id: data.id,
              title: data.title,
              url: data.url,
              display_url: data.display_url,
              delete_url: data.delete_url,
              width: data.width,
              height: data.height,
              size: data.size,
              time: data.time,
              expiration: data.expiration,
              filename: data.image.filename,
              extension: data.image.extension,
              mime: data.image.mime,
              thumb_url: data.thumb?.url,
              medium_url: data.medium?.url,
            },
          };
        }
      } catch (backupError) {
        console.error('Backup ImgBB upload also failed:', backupError.message);
      }
    }

    throw new Error(
      error.response?.data?.error?.message ||
      error.message ||
      'Failed to upload image to ImgBB'
    );
  }
};

/**
 * Upload multiple images to ImgBB
 * @param {Array} files - Array of file objects with path and originalname
 * @returns {Promise<Array>} Array of upload results
 */
const uploadMultipleToImgBB = async (files) => {
  const uploadPromises = files.map(async (file) => {
    try {
      const fileName = file.originalname || file.filename || 'image';
      const result = await uploadToImgBB(file.path, fileName);
      return result;
    } catch (error) {
      console.error(`Failed to upload ${file.originalname}:`, error.message);
      return {
        success: false,
        error: error.message,
        filename: file.originalname,
      };
    }
  });

  return Promise.all(uploadPromises);
};

/**
 * Delete uploaded image file from local storage
 * @param {string} filePath - Path to the file to delete
 */
const deleteLocalFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting local file:', error.message);
  }
};

module.exports = {
  uploadToImgBB,
  uploadMultipleToImgBB,
  deleteLocalFile,
};
