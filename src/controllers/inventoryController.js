const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const { uploadToImgBB, uploadMultipleToImgBB, deleteLocalFile } = require('../utils/imgbbUpload');


const transformToBackendFormat = (data) => {
  const transformed = { ...data };

  // Always ensure quantity object exists with proper structure
  transformed.quantity = {
    current: data.currentQuantity !== undefined ? Number(data.currentQuantity) : 0,
    minimum: data.minimumQuantity !== undefined ? Number(data.minimumQuantity) : 0,
    unit: data.unit || 'pieces'
  };
  delete transformed.currentQuantity;
  delete transformed.minimumQuantity;
  delete transformed.unit;


  if (data.purchasePrice !== undefined || data.sellingPrice !== undefined) {
    transformed.pricing = {
      purchasePrice: data.purchasePrice !== undefined ? Number(data.purchasePrice) : 0,
      sellingPrice: data.sellingPrice !== undefined ? Number(data.sellingPrice) : 0,
      currency: data.currency || 'USD'
    };
    delete transformed.purchasePrice;
    delete transformed.sellingPrice;
  }

  
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

  
  if (data.primaryImageIndex !== undefined) {
    transformed.primaryImage = Number(data.primaryImageIndex);
    delete transformed.primaryImageIndex;
  }

  return transformed;
};


const transformItem = (item, weightedAvgPrice = null) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;

  // Transform images
  const transformedImages = (itemObj.images || []).map(img => {
    if (typeof img === 'string') {
      return { path: img };
    }

    // Extract image path
    const imagePath = img.path || img.url || img.display_url || img;

    // Return transformed image object
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

  // Always use the original pricing.sellingPrice from the inventory model
  const finalSellingPrice = itemObj.pricing?.sellingPrice ?? 0;

  return {
    _id: itemObj._id,
    name: itemObj.itemName,
    itemName: itemObj.itemName,
    skuCode: itemObj.skuCode,
    description: itemObj.description,
    category: itemObj.category,
    tags: itemObj.tags || [],

    quantity: itemObj.quantity?.current ?? 0,
    currentStock: itemObj.quantity?.current ?? 0,
    currentQuantity: itemObj.quantity?.current ?? 0,
    lowStockThreshold: itemObj.quantity?.minimum ?? 10,
    minimumQuantity: itemObj.quantity?.minimum ?? 10,
    unit: itemObj.quantity?.unit ?? 'pieces',
    price: finalSellingPrice,
    purchasePrice: itemObj.pricing?.purchasePrice ?? 0,
    sellingPrice: finalSellingPrice,
    currency: itemObj.pricing?.currency ?? 'USD',
    profitMargin: itemObj.pricing?.profitMargin,
    profitSettings: itemObj.profitSettings,

    image: transformedImages.length > 0 ? (transformedImages[itemObj.primaryImage || 0].path || transformedImages[itemObj.primaryImage || 0]) : null,
    images: transformedImages,
    primaryImageIndex: itemObj.primaryImage || 0,
    primaryImage: itemObj.primaryImage,

    supplier: itemObj.supplier,
    supplierName: itemObj.supplier?.name || '',
    contactPerson: itemObj.supplier?.contactPerson || '',
    supplierEmail: itemObj.supplier?.email || '',
    supplierPhone: itemObj.supplier?.phone || '',
    supplierAddress: itemObj.supplier?.address || '',
    leadTime: itemObj.supplier?.leadTime || '',
    reorderPoint: itemObj.supplier?.reorderPoint || '',
    minOrderQuantity: itemObj.supplier?.minimumOrderQuantity || '',

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

      // Filter for low stock items
      items = items.filter(item => item.isLowStock);
      const total = items.length;

      return res.status(200).json({
        success: true,
        data: {
          items: items.map(item => transformItem(item)),
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
        items: items.map(item => transformItem(item)),
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




const createInventoryItem = async (req, res, next) => {
  try {
    
    const existing = await Inventory.findOne({ skuCode: req.body.skuCode.toUpperCase(), isDeleted: false });
    if (existing) {
      
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

    
    const itemData = transformToBackendFormat({
      ...req.body,
      createdBy: req.user.id,
      lastUpdatedBy: req.user.id
    });

    
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToImgBB(req.files);

        
        const successfulUploads = uploadResults.filter(result => result.success);

        if (successfulUploads.length === 0) {
          
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

        
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      } catch (uploadError) {
        console.error('ImgBB upload error:', uploadError);

        
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
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Create inventory item error:', error);
    next(error);
  }
};




const updateInventoryItem = async (req, res, next) => {
  try {
    let item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      
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

    
    const updateData = transformToBackendFormat(req.body);
    Object.keys(updateData).forEach(key => {
      if (key !== 'createdBy' && key !== 'stockHistory' && key !== 'images') {
        item[key] = updateData[key];
      }
    });

    
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleToImgBB(req.files);

        
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

        
        for (const file of req.files) {
          await deleteLocalFile(file.path);
        }
      } catch (uploadError) {
        console.error('ImgBB upload error:', uploadError);

        
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
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Update inventory item error:', error);
    next(error);
  }
};




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

    
    item.isDeleted = true;
    item.deletedAt = Date.now();
    item.deletedBy = req.user.id;
    item.lastUpdatedBy = req.user.id;
    await item.save();

    
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


// Get inventory items with weighted average prices (for POS)
const getInventoryItemsForPOS = async (req, res, next) => {
  try {
    const { page = 1, limit = 1000, category, search, lowStock } = req.query;

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

      // Filter for low stock items
      items = items.filter(item => item.isLowStock);
      const total = items.length;

      // Calculate weighted average prices for all items
      const itemsWithPrices = await Promise.all(items.map(async (item) => {
        const avgPrice = await Inventory.calculateWeightedAvgPrice(item._id);
        return transformItemWithWeightedPrice(item, avgPrice);
      }));

      return res.status(200).json({
        success: true,
        data: {
          items: itemsWithPrices,
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

    // Calculate weighted average prices for all items
    const itemsWithPrices = await Promise.all(items.map(async (item) => {
      const avgPrice = await Inventory.calculateWeightedAvgPrice(item._id);
      return transformItemWithWeightedPrice(item, avgPrice);
    }));

    res.status(200).json({
      success: true,
      data: {
        items: itemsWithPrices,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get inventory items for POS error:', error);
    next(error);
  }
};


// Helper function to transform item with weighted average price
const transformItemWithWeightedPrice = (item, weightedAvgPrice = null) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;

  // Transform images
  const transformedImages = (itemObj.images || []).map(img => {
    if (typeof img === 'string') {
      return { path: img };
    }

    const imagePath = img.path || img.url || img.display_url || img;

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

  // Use weighted average price if provided, otherwise fall back to pricing.sellingPrice
  const finalSellingPrice = weightedAvgPrice !== null ? weightedAvgPrice : (itemObj.pricing?.sellingPrice ?? 0);

  return {
    _id: itemObj._id,
    name: itemObj.itemName,
    itemName: itemObj.itemName,
    skuCode: itemObj.skuCode,
    description: itemObj.description,
    category: itemObj.category,
    tags: itemObj.tags || [],

    quantity: itemObj.quantity?.current ?? 0,
    currentStock: itemObj.quantity?.current ?? 0,
    currentQuantity: itemObj.quantity?.current ?? 0,
    lowStockThreshold: itemObj.quantity?.minimum ?? 10,
    minimumQuantity: itemObj.quantity?.minimum ?? 10,
    unit: itemObj.quantity?.unit ?? 'pieces',
    price: finalSellingPrice,
    purchasePrice: itemObj.pricing?.purchasePrice ?? 0,
    sellingPrice: finalSellingPrice,
    currency: itemObj.pricing?.currency ?? 'USD',
    profitMargin: itemObj.pricing?.profitMargin,
    profitSettings: itemObj.profitSettings,

    image: transformedImages.length > 0 ? (transformedImages[itemObj.primaryImage || 0].path || transformedImages[itemObj.primaryImage || 0]) : null,
    images: transformedImages,
    primaryImageIndex: itemObj.primaryImage || 0,
    primaryImage: itemObj.primaryImage,

    supplier: itemObj.supplier,
    supplierName: itemObj.supplier?.name || '',
    contactPerson: itemObj.supplier?.contactPerson || '',
    supplierEmail: itemObj.supplier?.email || '',
    supplierPhone: itemObj.supplier?.phone || '',
    supplierAddress: itemObj.supplier?.address || '',
    leadTime: itemObj.supplier?.leadTime || '',
    reorderPoint: itemObj.supplier?.reorderPoint || '',
    minOrderQuantity: itemObj.supplier?.minimumOrderQuantity || '',

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




const uploadImages = async (req, res, next) => {
  try {
    const item = await Inventory.findOne({ _id: req.params.id, isDeleted: false });

    if (!item) {
      
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
      
      const uploadResults = await uploadMultipleToImgBB(req.files);

      
      const successfulUploads = uploadResults.filter(result => result.success);

      if (successfulUploads.length === 0) {
        
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

      
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }

      
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
    
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await deleteLocalFile(file.path);
      }
    }

    console.error('Upload images error:', error);
    next(error);
  }
};




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

    
    const imageToDelete = item.images[imageIndex];

    
    const fs = require('fs').promises;
    try {
      await fs.unlink(imageToDelete.path);
    } catch (err) {
      console.error('Error deleting file from filesystem:', err);
    }

    
    item.images.splice(imageIndex, 1);

    
    if (item.primaryImage === imageIndex) {
      item.primaryImage = 0;
    } else if (item.primaryImage > imageIndex) {
      item.primaryImage -= 1;
    }

    item.lastUpdatedBy = req.user.id;
    await item.save();

    
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
  getInventoryItemsForPOS,
  getCategories,
  uploadImages,
  deleteImage,
  setPrimaryImage
};
