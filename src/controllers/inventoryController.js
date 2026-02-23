const Inventory = require('../models/Inventory');
const StockMovement = require('../models/StockMovement');
const AuditLog = require('../models/AuditLog');
const CustomerConnectOrder = require('../models/CustomerConnectOrder');
const RouteStarInvoice = require('../models/RouteStarInvoice');
const StockSummary = require('../models/StockSummary');
const RouteStarItemAlias = require('../models/RouteStarItemAlias');
const { uploadToImgBB, uploadMultipleToImgBB, deleteLocalFile } = require('../utils/imgbbUpload');


const transformToBackendFormat = (data) => {
  const transformed = { ...data };

  
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


const transformItem = (item, weightedAvgPrice = null, syncMetadata = null) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;

  
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
    updatedAt: itemObj.updatedAt,

    vendorName: itemObj.vendorName || '',
    orderNumber: itemObj.orderNumber || '',
    poNumber: itemObj.poNumber || '',
    orderCount: itemObj.orderCount || 0,
    totalPurchased: itemObj.totalPurchased || 0,

    customerName: itemObj.customerName || '',
    invoiceNumber: itemObj.invoiceNumber || '',
    invoiceType: itemObj.invoiceType || '',
    invoiceCount: itemObj.invoiceCount || 0,
    totalSold: itemObj.totalSold || 0,

    class: itemObj.class || '',
    warehouse: itemObj.warehouse || '',
    location: itemObj.location || '',

    sync: syncMetadata || itemObj.sync || {
      lastSyncedAt: null,
      syncSource: null,
      hasSyncedData: false,
      stockProcessed: false,
      availableQty: itemObj.quantity?.current || 0,
      reservedQty: 0,
      totalInQty: 0,
      totalOutQty: 0
    }
  };
};



const getSyncMetadata = async (skuCode) => {
  try {
    const CustomerConnectOrder = require('../models/CustomerConnectOrder');
    const RouteStarInvoice = require('../models/RouteStarInvoice');


    const ccOrders = await CustomerConnectOrder.find({
      'items.sku': skuCode.toUpperCase(),
      isDeleted: false
    })
    .sort({ lastSyncedAt: -1 })
    .limit(1)
    .select('lastSyncedAt');


    const rsInvoices = await RouteStarInvoice.find({
      'lineItems.sku': skuCode.toUpperCase(),
      isDeleted: false
    })
    .sort({ lastSyncedAt: -1 })
    .limit(1)
    .select('lastSyncedAt syncSource');

    const sources = [];
    let lastSyncedAt = null;

    if (ccOrders.length > 0) {
      sources.push('CustomerConnect');
      if (!lastSyncedAt || ccOrders[0].lastSyncedAt > lastSyncedAt) {
        lastSyncedAt = ccOrders[0].lastSyncedAt;
      }
    }

    if (rsInvoices.length > 0) {
      sources.push('RouteStar');
      if (!lastSyncedAt || rsInvoices[0].lastSyncedAt > lastSyncedAt) {
        lastSyncedAt = rsInvoices[0].lastSyncedAt;
      }
    }

    return {
      lastSyncedAt,
      syncSource: sources.length > 0 ? sources.join(', ') : null,
      hasSyncedData: sources.length > 0
    };
  } catch (error) {
    console.error('Error getting sync metadata:', error);
    return {
      lastSyncedAt: null,
      syncSource: null,
      hasSyncedData: false
    };
  }
};



const getEnrichedStockHistory = async (skuCode, stockHistory = []) => {
  try {
    
    const movements = await StockMovement.find({
      sku: skuCode.toUpperCase()
    })
    .populate('createdBy', 'username fullName')
    .sort({ timestamp: -1 });

    
    const enrichedHistory = stockHistory.map(entry => ({
      ...entry.toObject ? entry.toObject() : entry,
      source: 'MANUAL',
      movementType: entry.action === 'added' ? 'IN' : entry.action === 'removed' ? 'OUT' : 'ADJUST'
    }));

    
    movements.forEach(movement => {
      enrichedHistory.push({
        action: movement.type === 'IN' ? 'added' : movement.type === 'OUT' ? 'removed' : 'adjusted',
        quantity: movement.qty,
        reason: movement.notes || `${movement.refType}: ${movement.sourceRef || movement.refId}`,
        timestamp: movement.timestamp,
        updatedBy: movement.createdBy,
        source: 'STOCK_MOVEMENT',
        movementType: movement.type,
        refType: movement.refType,
        refId: movement.refId,
        sourceRef: movement.sourceRef
      });
    });

    
    enrichedHistory.sort((a, b) => {
      const timeA = a.timestamp || new Date(0);
      const timeB = b.timestamp || new Date(0);
      return timeB - timeA;
    });

    return enrichedHistory;
  } catch (error) {
    console.error('Error enriching stock history:', error);
    return stockHistory;
  }
};




const getInventoryItems = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, category, search, lowStock, includeSyncStatus } = req.query;

    
    const ccOrders = await CustomerConnectOrder.find({}).lean();
    const ccItemsMap = new Map();

    ccOrders.forEach(order => {
      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          const sku = item.sku.toUpperCase();

          if (search) {
            const searchRegex = new RegExp(search, 'i');
            if (!searchRegex.test(item.name) && !searchRegex.test(sku)) {
              return;
            }
          }

          if (ccItemsMap.has(sku)) {
            const existing = ccItemsMap.get(sku);
            existing.totalQuantity += item.qty || 0;
            existing.totalValue += item.lineTotal || 0;
            existing.orderCount += 1;
            if (order.lastSyncedAt > existing.lastSyncedAt) {
              existing.lastSyncedAt = order.lastSyncedAt;
              existing.latestUnitPrice = item.unitPrice || 0;
            }
          } else {
            ccItemsMap.set(sku, {
              skuCode: sku,
              itemName: item.name,
              name: item.name,
              description: `Purchased from ${order.vendor?.name || 'CustomerConnect'}`,
              totalQuantity: item.qty || 0,
              totalValue: item.lineTotal || 0,
              latestUnitPrice: item.unitPrice || 0,
              orderCount: 1,
              category: category || 'CustomerConnect',
              lastSyncedAt: order.lastSyncedAt || new Date(),
              source: 'customerconnect',
              isAutomated: true,
              vendorName: order.vendor?.name || '',
              orderNumber: order.orderNumber,
              poNumber: order.poNumber
            });
          }
        });
      }
    });

    
    const rsInvoices = await RouteStarInvoice.find({}).lean();
    const rsItemsMap = new Map();

    rsInvoices.forEach(invoice => {
      if (invoice.lineItems && invoice.lineItems.length > 0) {
        invoice.lineItems.forEach(item => {
          if (!item.sku) return;

          const sku = item.sku.toUpperCase();

          if (search) {
            const searchRegex = new RegExp(search, 'i');
            if (!searchRegex.test(item.name) && !searchRegex.test(sku) && !searchRegex.test(item.description || '')) {
              return;
            }
          }

          if (rsItemsMap.has(sku)) {
            const existing = rsItemsMap.get(sku);
            existing.totalQuantity += item.quantity || 0;
            existing.totalValue += item.amount || 0;
            existing.invoiceCount += 1;
            if (invoice.lastSyncedAt > existing.lastSyncedAt) {
              existing.lastSyncedAt = invoice.lastSyncedAt;
              existing.latestRate = item.rate || 0;
            }
          } else {
            rsItemsMap.set(sku, {
              skuCode: sku,
              itemName: item.name,
              name: item.name,
              description: item.description || `Sold to ${invoice.customer?.name || 'RouteStar Customer'}`,
              totalQuantity: item.quantity || 0,
              totalValue: item.amount || 0,
              latestRate: item.rate || 0,
              invoiceCount: 1,
              category: category || 'RouteStar',
              lastSyncedAt: invoice.lastSyncedAt || new Date(),
              source: 'routestar',
              isAutomated: true,
              customerName: invoice.customer?.name || '',
              invoiceNumber: invoice.invoiceNumber,
              invoiceType: invoice.invoiceType,
              class: item.class,
              warehouse: item.warehouse,
              location: item.location
            });
          }
        });
      }
    });

    
    const allAutomatedSkus = [...ccItemsMap.keys(), ...rsItemsMap.keys()];
    const stockSummaries = await StockSummary.find({
      sku: { $in: allAutomatedSkus }
    }).lean();

    const stockSummaryMap = new Map();
    stockSummaries.forEach(summary => {
      stockSummaryMap.set(summary.sku, summary);
    });

    
    const mergedItemsMap = new Map();

    
    ccItemsMap.forEach((ccItem, sku) => {
      const stockSummary = stockSummaryMap.get(sku);

      mergedItemsMap.set(sku, {
        _id: `cc_${sku}`,
        skuCode: ccItem.skuCode,
        itemName: ccItem.itemName,
        name: ccItem.name,
        description: ccItem.description,
        category: ccItem.category,
        tags: [],

        quantity: {
          current: stockSummary ? stockSummary.availableQty : ccItem.totalQuantity,
          minimum: stockSummary?.lowStockThreshold || 10,
          unit: 'pieces'
        },

        pricing: {
          purchasePrice: ccItem.latestUnitPrice,
          sellingPrice: ccItem.latestUnitPrice * 1.2,
          currency: 'USD'
        },

        images: [],
        primaryImage: 0,
        isActive: true,
        isLowStock: stockSummary ? stockSummary.availableQty <= (stockSummary.lowStockThreshold || 10) : false,

        vendorName: ccItem.vendorName,
        orderNumber: ccItem.orderNumber,
        poNumber: ccItem.poNumber,
        orderCount: ccItem.orderCount,
        totalPurchased: ccItem.totalQuantity,

        sync: {
          syncSource: 'customerconnect',
          hasSyncedData: true,
          lastSyncedAt: ccItem.lastSyncedAt,
          stockProcessed: stockSummary ? true : false,
          availableQty: stockSummary?.availableQty || 0,
          reservedQty: stockSummary?.reservedQty || 0,
          totalInQty: stockSummary?.totalInQty || 0,
          totalOutQty: stockSummary?.totalOutQty || 0
        }
      });
    });

    
    rsItemsMap.forEach((rsItem, sku) => {
      const stockSummary = stockSummaryMap.get(sku);

      if (mergedItemsMap.has(sku)) {
        const existing = mergedItemsMap.get(sku);
        const sources = [existing.sync?.syncSource, 'routestar'].filter(Boolean);

        mergedItemsMap.set(sku, {
          ...existing,
          description: existing.description || rsItem.description,
          quantity: {
            ...existing.quantity,
            current: stockSummary ? stockSummary.availableQty : existing.quantity.current
          },
          pricing: {
            ...existing.pricing,
            sellingPrice: rsItem.latestRate || existing.pricing.sellingPrice
          },
          customerName: rsItem.customerName,
          invoiceNumber: rsItem.invoiceNumber,
          invoiceType: rsItem.invoiceType,
          invoiceCount: rsItem.invoiceCount,
          totalSold: rsItem.totalQuantity,
          class: rsItem.class,
          warehouse: rsItem.warehouse,
          location: rsItem.location,
          sync: {
            syncSource: [...new Set(sources)].join(', '),
            hasSyncedData: true,
            lastSyncedAt: rsItem.lastSyncedAt > (existing.sync?.lastSyncedAt || 0)
              ? rsItem.lastSyncedAt
              : existing.sync?.lastSyncedAt,
            stockProcessed: stockSummary ? true : false,
            availableQty: stockSummary?.availableQty || existing.sync?.availableQty || 0,
            reservedQty: stockSummary?.reservedQty || existing.sync?.reservedQty || 0,
            totalInQty: stockSummary?.totalInQty || existing.sync?.totalInQty || 0,
            totalOutQty: stockSummary?.totalOutQty || existing.sync?.totalOutQty || 0
          }
        });
      } else {
        mergedItemsMap.set(sku, {
          _id: `rs_${sku}`,
          skuCode: rsItem.skuCode,
          itemName: rsItem.itemName,
          name: rsItem.name,
          description: rsItem.description,
          category: rsItem.category,
          tags: [],

          quantity: {
            current: stockSummary ? stockSummary.availableQty : 0,
            minimum: stockSummary?.lowStockThreshold || 10,
            unit: 'pieces'
          },

          pricing: {
            purchasePrice: rsItem.latestRate,
            sellingPrice: rsItem.latestRate,
            currency: 'USD'
          },

          images: [],
          primaryImage: 0,
          isActive: true,
          isLowStock: stockSummary ? stockSummary.availableQty <= (stockSummary.lowStockThreshold || 10) : false,

          customerName: rsItem.customerName,
          invoiceNumber: rsItem.invoiceNumber,
          invoiceType: rsItem.invoiceType,
          invoiceCount: rsItem.invoiceCount,
          totalSold: rsItem.totalQuantity,
          class: rsItem.class,
          warehouse: rsItem.warehouse,
          location: rsItem.location,

          sync: {
            syncSource: 'routestar',
            hasSyncedData: true,
            lastSyncedAt: rsItem.lastSyncedAt,
            stockProcessed: stockSummary ? true : false,
            availableQty: stockSummary?.availableQty || 0,
            reservedQty: stockSummary?.reservedQty || 0,
            totalInQty: stockSummary?.totalInQty || 0,
            totalOutQty: stockSummary?.totalOutQty || 0
          }
        });
      }
    });

    
    let mergedItems = Array.from(mergedItemsMap.values());

    
    if (category) {
      mergedItems = mergedItems.filter(item => {
        const itemCategory = item.category || '';
        return itemCategory.toLowerCase() === category.toLowerCase();
      });
    }

    
    if (lowStock === 'true') {
      mergedItems = mergedItems.filter(item => {
        const currentQty = item.quantity?.current || 0;
        const minQty = item.quantity?.minimum || 10;
        return currentQty <= minQty;
      });
    }

    
    mergedItems.sort((a, b) => {
      const dateA = a.sync?.lastSyncedAt || new Date(0);
      const dateB = b.sync?.lastSyncedAt || new Date(0);
      return new Date(dateB) - new Date(dateA);
    });

    
    const total = mergedItems.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedItems = mergedItems.slice(skip, skip + parseInt(limit));

    
    const transformedItems = paginatedItems.map(item => {
      
      return transformItem({
        toObject: () => item
      }, null, item.sync);
    });

    res.status(200).json({
      success: true,
      data: {
        items: transformedItems,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        },
        summary: {
          customerConnectItems: ccItemsMap.size,
          routeStarItems: rsItemsMap.size,
          totalMerged: total
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

    
    const syncMetadata = await getSyncMetadata(item.skuCode);

    
    const enrichedHistory = await getEnrichedStockHistory(item.skuCode, item.stockHistory);

    const transformedItem = transformItem(item, null, syncMetadata);
    transformedItem.stockHistory = enrichedHistory;

    res.status(200).json({
      success: true,
      data: { item: transformedItem }
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
    const { quantity, action, reason, refType, refId, sourceRef } = req.body;

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

    
    const movementType = action === 'add' ? 'IN' : action === 'remove' ? 'OUT' : 'ADJUST';
    const movementRefType = refType || 'MANUAL';
    const movementRefId = refId || item._id;

    try {
      await StockMovement.create({
        sku: item.skuCode,
        type: movementType,
        qty: Math.abs(quantity),
        refType: movementRefType,
        refId: movementRefId,
        sourceRef: sourceRef || null,
        notes: reason,
        createdBy: req.user.id
      });
    } catch (movementError) {
      console.error('Error creating stock movement:', movementError);
      
    }


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
      .select('skuCode stockHistory')
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

    
    const enrichedHistory = await getEnrichedStockHistory(item.skuCode, item.stockHistory);

    
    const history = enrichedHistory.slice(0, parseInt(limit));

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



const getInventoryItemsForPOS = async (req, res, next) => {
  try {
    const { page = 1, limit = 1000, category, search, lowStock } = req.query;

    
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

      
      items = items.filter(item => item.isLowStock);
      const total = items.length;

      
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



const transformItemWithWeightedPrice = (item, weightedAvgPrice = null) => {
  if (!item) return null;

  const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;

  
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



const getItemsBySyncSource = async (req, res, next) => {
  try {
    const { source, page = 1, limit = 10 } = req.query;

    if (!source || !['CustomerConnect', 'RouteStar'].includes(source)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Valid sync source is required (CustomerConnect or RouteStar)',
          code: 'INVALID_SOURCE'
        }
      });
    }

    let skus = [];

    if (source === 'CustomerConnect') {
      const CustomerConnectOrder = require('../models/CustomerConnectOrder');
      const orders = await CustomerConnectOrder.find({ isDeleted: false })
        .distinct('items.sku');
      skus = orders;
    } else if (source === 'RouteStar') {
      const RouteStarInvoice = require('../models/RouteStarInvoice');
      const invoices = await RouteStarInvoice.find({ isDeleted: false })
        .distinct('items.sku');
      skus = invoices;
    }

    
    const query = {
      skuCode: { $in: skus },
      isActive: true,
      isDeleted: false
    };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Inventory.countDocuments(query);

    const items = await Inventory.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    
    const itemsWithSync = await Promise.all(items.map(async (item) => {
      const syncMetadata = await getSyncMetadata(item.skuCode);
      return transformItem(item, null, syncMetadata);
    }));

    res.status(200).json({
      success: true,
      data: {
        items: itemsWithSync,
        source,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get items by sync source error:', error);
    next(error);
  }
};



const getInventorySyncStatus = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Inventory.countDocuments({ isActive: true, isDeleted: false });

    const items = await Inventory.find({ isActive: true, isDeleted: false })
      .select('itemName skuCode quantity')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    
    const syncStatusList = await Promise.all(items.map(async (item) => {
      const syncMetadata = await getSyncMetadata(item.skuCode);
      return {
        _id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        currentQuantity: item.quantity.current,
        sync: syncMetadata
      };
    }));

    res.status(200).json({
      success: true,
      data: {
        items: syncStatusList,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get inventory sync status error:', error);
    next(error);
  }
};


const getStockMovements = async (req, res, next) => {
  try {
    const { sku, type, page = 1, limit = 50, startDate, endDate } = req.query;

    const query = {};
    if (sku) query.sku = sku;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await StockMovement.countDocuments(query);

    const movements = await StockMovement.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        movements,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get stock movements error:', error);
    next(error);
  }
};


const getSyncHealth = async (req, res, next) => {
  try {
    
    const [totalItems, syncedItems, customerConnectOrders, routeStarInvoices] = await Promise.all([
      Inventory.countDocuments({ isActive: true, isDeleted: false }),
      Inventory.countDocuments({ isActive: true, isDeleted: false, 'quantity.current': { $gt: 0 } }),
      CustomerConnectOrder.countDocuments(),
      RouteStarInvoice.countDocuments()
    ]);

    
    const [lastCustomerConnectSync, lastRouteStarSync] = await Promise.all([
      CustomerConnectOrder.findOne().sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean(),
      RouteStarInvoice.findOne().sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean()
    ]);

    
    const unprocessedMovements = await StockMovement.countDocuments({ processed: false });

    res.status(200).json({
      success: true,
      data: {
        totalItems,
        syncedItems,
        syncSources: {
          customerConnect: {
            totalOrders: customerConnectOrders,
            lastSync: lastCustomerConnectSync?.lastSyncedAt || null
          },
          routeStar: {
            totalInvoices: routeStarInvoices,
            lastSync: lastRouteStarSync?.lastSyncedAt || null
          }
        },
        unprocessedMovements,
        healthStatus: unprocessedMovements === 0 ? 'healthy' : unprocessedMovements < 10 ? 'warning' : 'critical'
      }
    });
  } catch (error) {
    console.error('Get sync health error:', error);
    next(error);
  }
};


const getSyncInfo = async (req, res, next) => {
  try {
    const { id } = req.params;

    const item = await Inventory.findById(id).select('itemName skuCode quantity').lean();
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Inventory item not found'
      });
    }

    
    const syncMetadata = await getSyncMetadata(item.skuCode);

    
    const recentMovements = await StockMovement.find({ sku: item.skuCode })
      .sort({ timestamp: -1 })
      .limit(10)
      .populate('createdBy', 'name email')
      .lean();

    
    const [customerConnectOrders, routeStarInvoices] = await Promise.all([
      CustomerConnectOrder.find({ 'items.sku': item.skuCode })
        .sort({ lastSyncedAt: -1 })
        .limit(5)
        .select('orderNumber lastSyncedAt items.$')
        .lean(),
      RouteStarInvoice.find({ 'lineItems.sku': item.skuCode })
        .sort({ lastSyncedAt: -1 })
        .limit(5)
        .select('invoiceNumber lastSyncedAt lineItems.$')
        .lean()
    ]);

    res.status(200).json({
      success: true,
      data: {
        item: {
          _id: item._id,
          itemName: item.itemName,
          skuCode: item.skuCode,
          currentQuantity: item.quantity.current
        },
        sync: syncMetadata,
        recentMovements,
        syncHistory: {
          customerConnectOrders,
          routeStarInvoices
        }
      }
    });
  } catch (error) {
    console.error('Get sync info error:', error);
    next(error);
  }
};

/**
 * Get inventory items with RouteStar alias mappings for truck checkout
 * Returns items grouped by canonical name with all their aliases
 */
const getInventoryItemsForTruckCheckout = async (req, res, next) => {
  try {
    // Get all active inventory items
    const inventoryItems = await Inventory.find({ isActive: true, isDeleted: false })
      .sort({ itemName: 1 })
      .lean();

    // Get all RouteStar alias mappings
    const aliasMappings = await RouteStarItemAlias.find({ isActive: true }).lean();

    // Create a lookup map: itemName -> canonical name
    const aliasLookupMap = {};
    const canonicalToAliasesMap = {};

    aliasMappings.forEach(mapping => {
      // Map the canonical name to itself
      aliasLookupMap[mapping.canonicalName.toLowerCase()] = mapping.canonicalName;
      canonicalToAliasesMap[mapping.canonicalName] = mapping.aliases.map(a => a.name);

      // Map all aliases to the canonical name
      mapping.aliases.forEach(alias => {
        aliasLookupMap[alias.name.toLowerCase()] = mapping.canonicalName;
      });
    });

    // Transform inventory items with alias information
    const itemsWithAliases = inventoryItems.map(item => {
      const itemNameLower = item.itemName.toLowerCase();
      const canonicalName = aliasLookupMap[itemNameLower];
      const aliases = canonicalName ? canonicalToAliasesMap[canonicalName] || [] : [];

      return {
        ...transformItem(item),
        canonicalName: canonicalName || item.itemName,
        routeStarAliases: aliases,
        hasAliases: aliases.length > 0,
        categoryName: item.category
      };
    });

    res.status(200).json({
      success: true,
      data: {
        items: itemsWithAliases,
        total: itemsWithAliases.length
      }
    });
  } catch (error) {
    console.error('Get inventory items for truck checkout error:', error);
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
  getInventoryItemsForTruckCheckout,
  getCategories,
  uploadImages,
  deleteImage,
  setPrimaryImage,
  getItemsBySyncSource,
  getInventorySyncStatus,
  getStockMovements,
  getSyncHealth,
  getSyncInfo
};
