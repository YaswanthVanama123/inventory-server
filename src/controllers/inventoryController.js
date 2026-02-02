const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const { uploadToImgBB, uploadMultipleToImgBB, deleteLocalFile } = require('../utils/imgbbUpload');

// Transform frontend data to backend format
const transformToBackendFormat = (data) => {
  const transformed = { ...data };

  // Convert flat structure to nested for quantity
  if (data.currentQuantity !== undefined || data.minimumQuantity !== undefined || data.unit !== undefined) {
    transformed.quantity = {
      current: data.currentQuantity !== undefined ? Number(data.currentQuantity) : undefined,
      minimum: data.minimumQuantity !== undefined ? Number(data.minimumQuantity) : undefined,
      unit: data.unit || undefined
    };
    delete transformed.currentQuantity;
    delete transformed.minimumQuantity;
    delete transformed.unit;
  }

  // Convert flat structure to nested for pricing
  if (data.purchasePrice !== undefined || data.sellingPrice !== undefined) {
    transformed.pricing = {
      purchasePrice: data.purchasePrice !== undefined ? Number(data.purchasePrice) : undefined,
      sellingPrice: data.sellingPrice !== undefined ? Number(data.sellingPrice) : undefined,
      currency: data.currency || 'USD'
    };
    delete transformed.purchasePrice;
    delete transformed.sellingPrice;
  }

  // Convert flat structure to nested for supplier
  if (data.supplierName || data.contactPerson || data.supplierEmail || data.supplierPhone || data.supplierAddress || data.leadTime || data.reorderPoint || data.minOrderQuantity) {
    transformed.supplier = {
      name: data.supplierName || data.supplier?.name,
      contactPerson: data.contactPerson || data.supplier?.contactPerson,
      email: data.supplierEmail || data.supplier?.email,
      phone: data.supplierPhone || data.supplier?.phone,
      address: data.supplierAddress || data.supplier?.address,
      leadTime: data.leadTime !== undefined ? Number(data.leadTime) : data.supplier?.leadTime,
      reorderPoint: data.reorderPoint !== undefined ? Number(data.reorderPoint) : data.supplier?.reorderPoint,
      minimumOrderQuantity: data.minOrderQuantity !== undefined ? Number(data.minOrderQuantity) : data.supplier?.minimumOrderQuantity
    };
    delete transformed.supplierName;
    delete transformed.contactPerson;
    delete transformed.supplierEmail;
    delete transformed.supplierPhone;
    delete transformed.supplierAddress;
    delete transformed.leadTime;
    delete transformed.reorderPoint;
    delete transformed.minOrderQuantity;
  }

  // Handle primaryImageIndex
  if (data.primaryImageIndex !== undefined) {
    transformed.primaryImage = Number(data.primaryImageIndex);
    delete transformed.primaryImageIndex;
  }

  return transformed;
};

// Transform inventory item to frontend format
const transformItem = (item) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;

  // Transform images to include ImgBB URLs
  const transformedImages = (itemObj.images || []).map(img => {
    if (typeof img === 'string') {
      return { path: img }; // Already a URL, wrap in object
    }

    // For ImgBB images, use the display_url or url directly
    const imagePath = img.path || img.url || img.display_url || img;

    // Return object with all ImgBB data
    return {
      _id: img._id,
      path: imagePath,
      url: img.url,
      display_url: img.display_url,
      deleteUrl: img.deleteUrl,
      filename: img.filename,
      mimetype: img.mimetype,
      size: img.size,
      width: img.width,
      height: img.height,
      imgbbId: img.imgbbId,
      uploadedAt: img.uploadedAt,
      uploadedBy: img.uploadedBy
    };
  });

  return {
    _id: itemObj._id,
    name: itemObj.itemName,
    itemName: itemObj.itemName,
    skuCode: itemObj.skuCode,
    description: itemObj.description,
    category: itemObj.category,
    tags: itemObj.tags || [],
    // For list view and detail view (multiple aliases)
    quantity: itemObj.quantity?.current ?? 0,
    currentStock: itemObj.quantity?.current ?? 0,
    currentQuantity: itemObj.quantity?.current ?? 0,
    lowStockThreshold: itemObj.quantity?.minimum ?? 10,
    minimumQuantity: itemObj.quantity?.minimum ?? 10,
    unit: itemObj.quantity?.unit ?? 'pieces',
    price: itemObj.pricing?.sellingPrice ?? 0,
    purchasePrice: itemObj.pricing?.purchasePrice ?? 0,
    sellingPrice: itemObj.pricing?.sellingPrice ?? 0,
    currency: itemObj.pricing?.currency ?? 'USD',
    profitMargin: itemObj.pricing?.profitMargin,
    // Images - use ImgBB URLs directly
    image: transformedImages.length > 0 ? (transformedImages[itemObj.primaryImage || 0].path || transformedImages[itemObj.primaryImage || 0]) : null,
    images: transformedImages,
    primaryImageIndex: itemObj.primaryImage || 0,
    primaryImage: itemObj.primaryImage,
    // Supplier info (nested and flat)
    supplier: itemObj.supplier,
    supplierName: itemObj.supplier?.name || '',
    contactPerson: itemObj.supplier?.contactPerson || '',
    supplierEmail: itemObj.supplier?.email || '',
    supplierPhone: itemObj.supplier?.phone || '',
    supplierAddress: itemObj.supplier?.address || '',
    leadTime: itemObj.supplier?.leadTime || '',
    reorderPoint: itemObj.supplier?.reorderPoint || '',
    minOrderQuantity: itemObj.supplier?.minimumOrderQuantity || '',
    // Meta
    stockHistory: itemObj.stockHistory,
    isActive: itemObj.isActive,
    isLowStock: itemObj.isLowStock,
    needsReorder: itemObj.needsReorder,
    createdBy: itemObj.createdBy,
    lastUpdatedBy: itemObj.lastUpdatedBy,
    createdAt: itemObj.createdAt,
    updatedAt: itemObj.updatedAt
  };
};

// @desc    Get all inventory items
// @route   GET /api/inventory
// @access  Private (Employee + Admin)
const getInventoryItems = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, category, search, lowStock } = req.query;

    // Build query
    const query = { isActive: true, isDeleted: false };
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { skuCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    let items;

    if (lowStock === 'true') {
      items = await Inventory.find(query)
        .populate('createdBy', 'username fullName')
        .populate('lastUpdatedBy', 'username fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      // Filter for low stock
      items = items.filter(item => item.isLowStock);
      const total = items.length;

      return res.status(200).json({
        success: true,
        data: {
          items: items.map(transformItem),
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            limit: parseInt(limit)
          }
        }
      });
    }

    const total = await Inventory.countDocuments(query);

    items = await Inventory.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        items: items.map(transformItem),
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get inventory items error:', error);
    next(error);
  }
};

// @desc    Get single inventory item
// @route   GET /api/inventory/:id
// @access  Private (Employee + Admin)
const getInventoryItem = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false })
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .populate('stockHistory.updatedBy', 'username fullName');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: { item: transformItem(item) }
    });
  } catch (error) {
    console.error('Get inventory item error:', error);
    next(error);
  }
};

// @desc    Create inventory item
// @route   POST /api/inventory
// @access  Private/Admin
const createInventoryItem = async (req, res, next) => {
  try {
    // Check if SKU already exists (not deleted)
    const existing = await Inventory.findOne({ skuCode: req.body.skuCode.toUpperCase(), isDeleted: false });
    if (existing) {
      // Clean up uploaded files if any
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      }

      return res.status(400).json({
        success: false,
        error: {
          message: 'SKU code already exists',
          code: 'DUPLICATE_SKU'
        }
      });
    }

    // Prepare item data
    const itemData = transformToBackendFormat({
      ...req.body,
      createdBy: req.user.id,
      lastUpdatedBy: req.user.id
    });

    // Upload images to ImgBB if provided
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToImgBB(req.files);

        // Filter successful uploads
        const successfulUploads = uploadResults.filter(result => result.success);

        if (successfulUploads.length === 0) {
          // Clean up local files
          for (const file of req.files) {
            await deleteLocalFile(file.path);
          }

          return res.status(500).json({
            success: false,
            error: {
              message: 'Failed to upload images to ImgBB',
              code: 'IMAGE_UPLOAD_FAILED'
            }
          });
        }

        // Store ImgBB image data
        itemData.images = successfulUploads.map((result, index) => ({
          filename: result.data.filename,
          path: result.data.display_url,
          url: result.data.url,
          deleteUrl: result.data.delete_url,
          mimetype: result.data.mime,
          size: result.data.size,
          width: result.data.width,
          height: result.data.height,
          imgbbId: result.data.id,
          uploadedBy: req.user.id
        }));

        // Clean up local files after successful upload
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      } catch (uploadError) {
        console.error('ImgBB upload error:', uploadError);

        // Clean up local files
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }

        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload images',
            code: 'IMAGE_UPLOAD_ERROR',
            details: uploadError.message
          }
        });
      }
    }

    const item = await Inventory.create(itemData);

    // Create audit log
    await AuditLog.create({
      action: 'CREATE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: { itemName: item.itemName, skuCode: item.skuCode },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      data: { item: transformItem(item) },
      message: 'Inventory item created successfully'
    });
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Create inventory item error:', error);
    next(error);
  }
};

// @desc    Update inventory item
// @route   PUT /api/inventory/:id
// @access  Private/Admin
const updateInventoryItem = async (req, res, next) => {
  try {
    let item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      // Clean up uploaded files if any
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      }

      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    // Transform and update fields
    const updateData = transformToBackendFormat(req.body);
    Object.keys(updateData).forEach(key => {
      if (key !== 'createdBy' && key !== 'stockHistory' && key !== 'images') {
        item[key] = updateData[key];
      }
    });

    // Add new images if uploaded
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToImgBB(req.files);

        // Filter successful uploads
        const successfulUploads = uploadResults.filter(result => result.success);

        if (successfulUploads.length > 0) {
          const newImages = successfulUploads.map(result => ({
            filename: result.data.filename,
            path: result.data.display_url,
            url: result.data.url,
            deleteUrl: result.data.delete_url,
            mimetype: result.data.mime,
            size: result.data.size,
            width: result.data.width,
            height: result.data.height,
            imgbbId: result.data.id,
            uploadedBy: req.user.id
          }));
          item.images.push(...newImages);
        }

        // Clean up local files after upload
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      } catch (uploadError) {
        console.error('ImgBB upload error:', uploadError);

        // Clean up local files
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }

        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload images',
            code: 'IMAGE_UPLOAD_ERROR',
            details: uploadError.message
          }
        });
      }
    }

    item.lastUpdatedBy = req.user.id;
    await item.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: req.body,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      data: { item },
      message: 'Inventory item updated successfully'
    });
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Update inventory item error:', error);
    next(error);
  }
};

// @desc    Delete inventory item
// @route   DELETE /api/inventory/:id
// @access  Private/Admin
const deleteInventoryItem = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    // Soft delete by marking as deleted
    item.isDeleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user.id;
    item.lastUpdatedBy = req.user.id;
    await item.save();

    // Create audit log
    await AuditLog.create({
      action: 'DELETE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: { itemName: item.itemName, skuCode: item.skuCode },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Inventory item deleted successfully'
    });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    next(error);
  }
};

// @desc    Update stock quantity
// @route   PATCH /api/inventory/:id/stock
// @access  Private (Employee + Admin)
const updateStock = async (req, res, next) => {
  try {
    const { quantity, action, reason } = req.body;

    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    const previousQuantity = item.quantity.current;
    let newQuantity = previousQuantity;

    // Calculate new quantity based on action
    switch (action) {
      case 'add':
        newQuantity = previousQuantity + quantity;
        break;
      case 'remove':
        newQuantity = previousQuantity - quantity;
        if (newQuantity < 0) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Insufficient stock quantity',
              code: 'INSUFFICIENT_STOCK'
            }
          });
        }
        break;
      case 'set':
        newQuantity = quantity;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid action',
            code: 'INVALID_ACTION'
          }
        });
    }

    // Update quantity and add to history
    item.quantity.current = newQuantity;
    item.stockHistory.push({
      action: action === 'add' ? 'added' : action === 'remove' ? 'removed' : 'adjusted',
      quantity,
      previousQuantity,
      newQuantity,
      reason,
      updatedBy: req.user.id
    });
    item.lastUpdatedBy = req.user.id;

    await item.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: { action, quantity, previousQuantity, newQuantity, reason },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      data: { item },
      message: 'Stock updated successfully'
    });
  } catch (error) {
    console.error('Update stock error:', error);
    next(error);
  }
};

// @desc    Get stock history
// @route   GET /api/inventory/:id/history
// @access  Private (Employee + Admin)
const getStockHistory = async (req, res, next) => {
  try {
    const { limit = 50 } = req.query;

    const item = await Inventory.findById(req.params.id)
      .select('stockHistory')
      .populate('stockHistory.updatedBy', 'username fullName');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    const history = item.stockHistory
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: { history }
    });
  } catch (error) {
    console.error('Get stock history error:', error);
    next(error);
  }
};

// @desc    Get low stock items
// @route   GET /api/inventory/low-stock
// @access  Private (Employee + Admin)
const getLowStockItems = async (req, res, next) => {
  try {
    const items = await Inventory.find({ isActive: true, isDeleted: false })
      .populate('createdBy', 'username fullName');

    const lowStockItems = items.filter(item => item.isLowStock);

    res.status(200).json({
      success: true,
      data: {
        items: lowStockItems.map(transformItem),
        count: lowStockItems.length
      }
    });
  } catch (error) {
    console.error('Get low stock items error:', error);
    next(error);
  }
};

// @desc    Get all categories
// @route   GET /api/inventory/categories
// @access  Private (Employee + Admin)
const getCategories = async (req, res, next) => {
  try {
    const categories = await Inventory.distinct('category');

    res.status(200).json({
      success: true,
      data: { categories }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    next(error);
  }
};

// @desc    Upload images to inventory item
// @route   POST /api/inventory/:id/images
// @access  Private/Admin
const uploadImages = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      // Clean up uploaded files
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      }

      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No images uploaded',
          code: 'NO_FILES'
        }
      });
    }

    try {
      // Upload images to ImgBB
      const uploadResults = await uploadMultipleToImgBB(req.files);

      // Filter successful uploads
      const successfulUploads = uploadResults.filter(result => result.success);

      if (successfulUploads.length === 0) {
        // Clean up local files
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }

        return res.status(500).json({
          success: false,
          error: {
            message: 'Failed to upload images to ImgBB',
            code: 'IMAGE_UPLOAD_FAILED'
          }
        });
      }

      // Add images to item
      const newImages = successfulUploads.map(result => ({
        filename: result.data.filename,
        path: result.data.display_url,
        url: result.data.url,
        deleteUrl: result.data.delete_url,
        mimetype: result.data.mime,
        size: result.data.size,
        width: result.data.width,
        height: result.data.height,
        imgbbId: result.data.id,
        uploadedBy: req.user.id
      }));

      item.images.push(...newImages);
      item.lastUpdatedBy = req.user.id;
      await item.save();

      // Clean up local files after successful upload
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }

      // Create audit log
      await AuditLog.create({
        action: 'UPDATE',
        resource: 'INVENTORY',
        resourceId: item._id,
        performedBy: req.user.id,
        details: { action: 'upload_images', imageCount: newImages.length },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(200).json({
        success: true,
        data: { item },
        message: `${newImages.length} image(s) uploaded successfully`
      });
    } catch (uploadError) {
      console.error('ImgBB upload error:', uploadError);

      // Clean up local files
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }

      return res.status(500).json({
        success: false,
        error: {
          message: 'Failed to upload images',
          code: 'IMAGE_UPLOAD_ERROR',
          details: uploadError.message
        }
      });
    }
  } catch (error) {
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Upload images error:', error);
    next(error);
  }
};

// @desc    Delete image from inventory item
// @route   DELETE /api/inventory/:id/images/:imageId
// @access  Private/Admin
const deleteImage = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    const imageId = req.params.imageId;
    const imageIndex = item.images.findIndex(img => img._id.toString() === imageId);

    if (imageIndex === -1) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Image not found',
          code: 'IMAGE_NOT_FOUND'
        }
      });
    }

    // Get image details before deletion
    const imageToDelete = item.images[imageIndex];

    // Delete file from filesystem
    const fs = require('fs').promises;
    try {
      await fs.unlink(imageToDelete.path);
    } catch (err) {
      console.error('Error deleting file from filesystem:', err);
    }

    // Remove image from array
    item.images.splice(imageIndex, 1);

    // Adjust primaryImage if necessary
    if (item.primaryImage === imageIndex) {
      item.primaryImage = 0;
    } else if (item.primaryImage > imageIndex) {
      item.primaryImage -= 1;
    }

    item.lastUpdatedBy = req.user.id;
    await item.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: { action: 'delete_image', filename: imageToDelete.filename },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      data: { item },
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Delete image error:', error);
    next(error);
  }
};

// @desc    Set primary image for inventory item
// @route   PATCH /api/inventory/:id/images/primary
// @access  Private/Admin
const setPrimaryImage = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Inventory item not found',
          code: 'ITEM_NOT_FOUND'
        }
      });
    }

    const { imageIndex } = req.body;

    if (imageIndex === undefined || imageIndex === null) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Image index is required',
          code: 'MISSING_IMAGE_INDEX'
        }
      });
    }

    if (imageIndex < 0 || imageIndex >= item.images.length) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid image index',
          code: 'INVALID_IMAGE_INDEX'
        }
      });
    }

    item.primaryImage = imageIndex;
    item.lastUpdatedBy = req.user.id;
    await item.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVENTORY',
      resourceId: item._id,
      performedBy: req.user.id,
      details: { action: 'set_primary_image', imageIndex },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      data: { item },
      message: 'Primary image set successfully'
    });
  } catch (error) {
    console.error('Set primary image error:', error);
    next(error);
  }
};

module.exports = {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  updateStock,
  getStockHistory,
  getLowStockItems,
  getCategories,
  uploadImages,
  deleteImage,
  setPrimaryImage
};
