const Inventory = require('../models/Inventory');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const PaymentType = require('../models/PaymentType');
const AuditLog = require('../models/AuditLog');


exports.getAllDeletedItems = async (req, res) => {
  try {
    const { type, search, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    let items = [];

    
    if (!type || type === 'all' || type === 'inventory') {
      const inventoryItems = await Inventory.find({ isDeleted: true })
        .populate('deletedBy', 'fullName username')
        .sort({ deletedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      items = [
        ...items,
        ...inventoryItems.map(item => ({
          id: item._id,
          name: item.itemName,
          type: 'inventory',
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy?.fullName || item.deletedBy?.username || 'Unknown',
          data: item,
        })),
      ];
    }

    
    if (!type || type === 'all' || type === 'invoices') {
      const invoiceItems = await Invoice.find({ isDeleted: true })
        .populate('deletedBy', 'fullName username')
        .sort({ deletedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      items = [
        ...items,
        ...invoiceItems.map(item => ({
          id: item._id,
          name: `Invoice ${item.invoiceNumber}`,
          type: 'invoices',
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy?.fullName || item.deletedBy?.username || 'Unknown',
          data: item,
        })),
      ];
    }

    
    if (!type || type === 'all' || type === 'users') {
      const userItems = await User.find({ isDeleted: true })
        .populate('deletedBy', 'fullName username')
        .sort({ deletedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      items = [
        ...items,
        ...userItems.map(item => ({
          id: item._id,
          name: item.fullName || item.username,
          type: 'users',
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy?.fullName || item.deletedBy?.username || 'Unknown',
          data: item,
        })),
      ];
    }

    
    if (!type || type === 'all' || type === 'coupons') {
      const couponItems = await Coupon.find({ isDeleted: true })
        .populate('deletedBy', 'fullName username')
        .sort({ deletedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      items = [
        ...items,
        ...couponItems.map(item => ({
          id: item._id,
          name: item.code,
          type: 'coupons',
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy?.fullName || item.deletedBy?.username || 'Unknown',
          data: item,
        })),
      ];
    }

    
    if (!type || type === 'all' || type === 'payment-types') {
      const paymentTypeItems = await PaymentType.find({ isDeleted: true })
        .populate('deletedBy', 'fullName username')
        .sort({ deletedAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

      items = [
        ...items,
        ...paymentTypeItems.map(item => ({
          id: item._id,
          name: item.displayName,
          type: 'payment-types',
          deletedAt: item.deletedAt,
          deletedBy: item.deletedBy?.fullName || item.deletedBy?.username || 'Unknown',
          data: item,
        })),
      ];
    }

    
    if (search) {
      items = items.filter(item =>
        item.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    
    items.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));

    res.status(200).json({
      success: true,
      count: items.length,
      items,
    });
  } catch (error) {
    console.error('Error fetching deleted items:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch deleted items',
        code: 'FETCH_FAILED',
      },
    });
  }
};


exports.restoreItem = async (req, res) => {
  try {
    const { type, id } = req.params;

    let Model;
    switch (type) {
      case 'inventory':
        Model = Inventory;
        break;
      case 'invoices':
        Model = Invoice;
        break;
      case 'users':
        Model = User;
        break;
      case 'coupons':
        Model = Coupon;
        break;
      case 'payment-types':
        Model = PaymentType;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid item type',
            code: 'INVALID_TYPE',
          },
        });
    }

    const item = await Model.findOne({ _id: id, isDeleted: true });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deleted item not found',
          code: 'NOT_FOUND',
        },
      });
    }

    item.isDeleted = false;
    item.deletedAt = null;
    item.deletedBy = null;
    await item.save();

    
    const resourceMap = {
      'inventory': 'INVENTORY',
      'invoices': 'INVOICE',
      'users': 'USER',
      'coupons': 'COUPON',
      'payment-types': 'PAYMENT_TYPE',
    };

    
    const itemName = item.itemName || item.invoiceNumber || item.username || item.fullName || item.code || item.displayName || 'Unknown';

    
    await AuditLog.create({
      action: 'RESTORE',
      resource: resourceMap[type] || 'TRASH',
      resourceId: item._id,
      performedBy: req.user.id,
      details: {
        name: itemName,
        type: type,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(200).json({
      success: true,
      message: 'Item restored successfully',
      item,
    });
  } catch (error) {
    console.error('Error restoring item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to restore item',
        code: 'RESTORE_FAILED',
      },
    });
  }
};


exports.permanentlyDeleteItem = async (req, res) => {
  try {
    const { type, id } = req.params;

    let Model;
    switch (type) {
      case 'inventory':
        Model = Inventory;
        break;
      case 'invoices':
        Model = Invoice;
        break;
      case 'users':
        Model = User;
        break;
      case 'coupons':
        Model = Coupon;
        break;
      case 'payment-types':
        Model = PaymentType;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid item type',
            code: 'INVALID_TYPE',
          },
        });
    }

    const item = await Model.findOneAndDelete({ _id: id, isDeleted: true });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Deleted item not found',
          code: 'NOT_FOUND',
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Item permanently deleted',
    });
  } catch (error) {
    console.error('Error permanently deleting item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to permanently delete item',
        code: 'DELETE_FAILED',
      },
    });
  }
};


exports.emptyTrash = async (req, res) => {
  try {
    const results = await Promise.all([
      Inventory.deleteMany({ isDeleted: true }),
      Invoice.deleteMany({ isDeleted: true }),
      User.deleteMany({ isDeleted: true }),
      Coupon.deleteMany({ isDeleted: true }),
      PaymentType.deleteMany({ isDeleted: true }),
    ]);

    const totalDeleted = results.reduce((sum, result) => sum + result.deletedCount, 0);

    res.status(200).json({
      success: true,
      message: `Permanently deleted ${totalDeleted} items`,
      deletedCount: totalDeleted,
    });
  } catch (error) {
    console.error('Error emptying trash:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to empty trash',
        code: 'EMPTY_FAILED',
      },
    });
  }
};
