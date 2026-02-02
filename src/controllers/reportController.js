const Inventory = require('../models/Inventory');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const Invoice = require('../models/Invoice');
const { Parser } = require('json2csv');
const PDFDocument = require('pdfkit');




const getDashboard = async (req, res, next) => {
  try {
    
    const totalItems = await Inventory.countDocuments({ isActive: true });

    
    const items = await Inventory.find({ isActive: true });
    const totalValue = items.reduce((sum, item) => {
      return sum + (item.pricing.sellingPrice * item.quantity.current);
    }, 0);

    
    const lowStockCount = items.filter(item => item.isLowStock).length;

    
    const reorderCount = items.filter(item => item.needsReorder).length;

    
    const categoryStats = await Inventory.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    
    const recentActivity = await AuditLog.find({ resource: 'INVENTORY' })
      .populate('performedBy', 'username fullName')
      .sort({ timestamp: -1 })
      .limit(10);

    
    const topValueItems = items
      .map(item => ({
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        value: item.pricing.sellingPrice * item.quantity.current,
        quantity: item.quantity.current
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalItems,
          totalValue,
          lowStockCount,
          reorderCount
        },
        categoryStats,
        recentActivity,
        topValueItems
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    next(error);
  }
};




const getStockSummary = async (req, res, next) => {
  try {
    const { category } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query).select('itemName skuCode category quantity pricing');

    const summary = items.map(item => ({
      id: item._id,
      itemName: item.itemName,
      skuCode: item.skuCode,
      category: item.category,
      currentStock: item.quantity.current,
      minimumStock: item.quantity.minimum,
      unit: item.quantity.unit,
      purchasePrice: item.pricing.purchasePrice,
      sellingPrice: item.pricing.sellingPrice,
      totalValue: item.pricing.sellingPrice * item.quantity.current,
      profitMargin: item.pricing.profitMargin,
      status: item.isLowStock ? 'Low Stock' : 'Adequate'
    }));

    
    const totals = {
      totalItems: summary.length,
      totalQuantity: summary.reduce((sum, item) => sum + item.currentStock, 0),
      totalValue: summary.reduce((sum, item) => sum + item.totalValue, 0),
      lowStockItems: summary.filter(item => item.status === 'Low Stock').length
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        totals
      }
    });
  } catch (error) {
    console.error('Get stock summary error:', error);
    next(error);
  }
};




const getProfitMarginReport = async (req, res, next) => {
  try {
    const { sortBy = 'margin' } = req.query;

    const items = await Inventory.find({ isActive: true })
      .select('itemName skuCode category quantity pricing');

    const profitData = items.map(item => {
      const totalCost = item.pricing.purchasePrice * item.quantity.current;
      const totalRevenue = item.pricing.sellingPrice * item.quantity.current;
      const totalProfit = totalRevenue - totalCost;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        quantity: item.quantity.current,
        purchasePrice: item.pricing.purchasePrice,
        sellingPrice: item.pricing.sellingPrice,
        profitMargin: item.pricing.profitMargin,
        unitProfit: item.pricing.sellingPrice - item.pricing.purchasePrice,
        totalCost,
        totalRevenue,
        totalProfit
      };
    });

    
    if (sortBy === 'margin') {
      profitData.sort((a, b) => b.profitMargin - a.profitMargin);
    } else if (sortBy === 'profit') {
      profitData.sort((a, b) => b.totalProfit - a.totalProfit);
    } else if (sortBy === 'revenue') {
      profitData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    }

    
    const overallStats = {
      totalRevenue: profitData.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalCost: profitData.reduce((sum, item) => sum + item.totalCost, 0),
      totalProfit: profitData.reduce((sum, item) => sum + item.totalProfit, 0),
      averageMargin: profitData.reduce((sum, item) => sum + item.profitMargin, 0) / profitData.length || 0
    };

    res.status(200).json({
      success: true,
      data: {
        items: profitData,
        stats: overallStats
      }
    });
  } catch (error) {
    console.error('Get profit margin report error:', error);
    next(error);
  }
};




const getReorderList = async (req, res, next) => {
  try {
    const items = await Inventory.find({ isActive: true })
      .populate('createdBy', 'username fullName');

    const reorderItems = items
      .filter(item => item.needsReorder)
      .map(item => ({
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        currentStock: item.quantity.current,
        minimumStock: item.quantity.minimum,
        reorderPoint: item.supplier.reorderPoint,
        supplierName: item.supplier.name,
        supplierEmail: item.supplier.email,
        supplierPhone: item.supplier.phone,
        minimumOrderQuantity: item.supplier.minimumOrderQuantity,
        leadTime: item.supplier.leadTime,
        suggestedOrderQuantity: Math.max(
          item.supplier.minimumOrderQuantity,
          item.quantity.minimum - item.quantity.current + 10
        )
      }))
      .sort((a, b) => a.currentStock - b.currentStock);

    res.status(200).json({
      success: true,
      data: {
        items: reorderItems,
        count: reorderItems.length
      }
    });
  } catch (error) {
    console.error('Get reorder list error:', error);
    next(error);
  }
};




const getAuditLogs = async (req, res, next) => {
  try {
    const { action, resource, from, to, page = 1, limit = 50 } = req.query;

    const query = {};
    if (action) query.action = action;
    if (resource) query.resource = resource;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AuditLog.countDocuments(query);

    const logs = await AuditLog.find(query)
      .populate('performedBy', 'username fullName role')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    next(error);
  }
};




const getSalesReport = async (req, res, next) => {
  try {
    const { startDate, endDate, category, groupBy = 'day' } = req.query;

    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    
    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(query)
      .populate('createdBy', 'username fullName')
      .populate('items.inventory', 'pricing category')
      .sort({ invoiceDate: -1 });

    
    let filteredInvoices = invoices;
    if (category) {
      filteredInvoices = invoices.filter(invoice =>
        invoice.items.some(item => {
          return item.inventory && item.inventory.category === category;
        })
      );
    }

    
    const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    let totalCost = 0;
    let totalProfit = 0;

    filteredInvoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          totalCost += itemCost;
          totalProfit += item.subtotal - itemCost;
        }
      });
    });

    const totalInvoices = filteredInvoices.length;
    const averageOrderValue = totalInvoices > 0 ? totalSales / totalInvoices : 0;

    
    const salesByPeriod = {};
    filteredInvoices.forEach(invoice => {
      let periodKey;
      const date = new Date(invoice.invoiceDate);

      if (groupBy === 'day') {
        periodKey = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'year') {
        periodKey = String(date.getFullYear());
      }

      if (!salesByPeriod[periodKey]) {
        salesByPeriod[periodKey] = {
          period: periodKey,
          sales: 0,
          cost: 0,
          profit: 0,
          invoices: 0
        };
      }

      salesByPeriod[periodKey].sales += invoice.totalAmount;
      salesByPeriod[periodKey].invoices += 1;

      
      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          salesByPeriod[periodKey].cost += itemCost;
          salesByPeriod[periodKey].profit += item.subtotal - itemCost;
        }
      });
    });

    
    const chartData = Object.values(salesByPeriod).sort((a, b) =>
      a.period.localeCompare(b.period)
    );

    
    const categoryStats = {};
    filteredInvoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';
        if (!categoryStats[itemCategory]) {
          categoryStats[itemCategory] = {
            category: itemCategory,
            sales: 0,
            quantity: 0,
            profit: 0
          };
        }
        categoryStats[itemCategory].sales += item.subtotal;
        categoryStats[itemCategory].quantity += item.quantity;
        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          categoryStats[itemCategory].profit += itemProfit;
        }
      });
    });

    
    const paymentStatusStats = filteredInvoices.reduce((acc, invoice) => {
      const status = invoice.paymentStatus || 'pending';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    
    const recentInvoices = filteredInvoices.slice(0, 10).map(inv => {
      let invoiceProfit = 0;
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          invoiceProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
        }
      });

      return {
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        invoiceDate: inv.invoiceDate,
        totalAmount: inv.totalAmount,
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        profit: invoiceProfit
      };
    });

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalSales,
          totalCost,
          totalProfit,
          totalInvoices,
          averageOrderValue,
          profitMargin: totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(2) : 0
        },
        chartData,
        categoryStats: Object.values(categoryStats).sort((a, b) => b.sales - a.sales),
        paymentStatusStats,
        recentInvoices
      }
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    next(error);
  }
};




const getInventoryValuation = async (req, res, next) => {
  try {
    const { category } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query)
      .select('itemName skuCode category quantity pricing supplier');

    
    const valuationData = items.map(item => {
      const costValue = item.pricing.purchasePrice * item.quantity.current;
      const sellingValue = item.pricing.sellingPrice * item.quantity.current;
      const potentialProfit = sellingValue - costValue;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        quantity: item.quantity.current,
        unit: item.quantity.unit,
        purchasePrice: item.pricing.purchasePrice,
        sellingPrice: item.pricing.sellingPrice,
        costValue,
        sellingValue,
        potentialProfit,
        profitMargin: item.pricing.profitMargin,
        supplierName: item.supplier.name
      };
    });

    
    valuationData.sort((a, b) => b.sellingValue - a.sellingValue);

    
    const totals = {
      totalItems: valuationData.length,
      totalQuantity: valuationData.reduce((sum, item) => sum + item.quantity, 0),
      totalCostValue: valuationData.reduce((sum, item) => sum + item.costValue, 0),
      totalSellingValue: valuationData.reduce((sum, item) => sum + item.sellingValue, 0),
      totalPotentialProfit: valuationData.reduce((sum, item) => sum + item.potentialProfit, 0),
      averageProfitMargin: valuationData.reduce((sum, item) => sum + item.profitMargin, 0) / valuationData.length || 0
    };

    
    const categoryBreakdown = {};
    valuationData.forEach(item => {
      if (!categoryBreakdown[item.category]) {
        categoryBreakdown[item.category] = {
          category: item.category,
          items: 0,
          costValue: 0,
          sellingValue: 0,
          potentialProfit: 0
        };
      }
      categoryBreakdown[item.category].items += 1;
      categoryBreakdown[item.category].costValue += item.costValue;
      categoryBreakdown[item.category].sellingValue += item.sellingValue;
      categoryBreakdown[item.category].potentialProfit += item.potentialProfit;
    });

    
    const topValueItems = valuationData.slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        totals,
        categoryBreakdown: Object.values(categoryBreakdown).sort((a, b) => b.sellingValue - a.sellingValue),
        topValueItems,
        allItems: valuationData
      }
    });
  } catch (error) {
    console.error('Get inventory valuation error:', error);
    next(error);
  }
};




const getTopSellingItems = async (req, res, next) => {
  try {
    const { startDate, endDate, limit = 20, category } = req.query;

    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    
    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(query).populate('items.inventory', 'pricing category');

    
    const itemSales = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';

        
        if (category && itemCategory !== category) return;

        const key = item.skuCode || item.itemName;
        if (!itemSales[key]) {
          itemSales[key] = {
            itemName: item.itemName,
            skuCode: item.skuCode,
            category: itemCategory,
            totalQuantitySold: 0,
            totalRevenue: 0,
            totalProfit: 0,
            invoiceCount: 0,
            averagePrice: 0
          };
        }

        itemSales[key].totalQuantitySold += item.quantity;
        itemSales[key].totalRevenue += item.subtotal;

        
        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          itemSales[key].totalProfit += itemProfit;
        }

        itemSales[key].invoiceCount += 1;
      });
    });

    
    const topSellingItems = Object.values(itemSales)
      .map(item => ({
        ...item,
        averagePrice: item.totalQuantitySold > 0 ? item.totalRevenue / item.totalQuantitySold : 0,
        averageProfitPerUnit: item.totalQuantitySold > 0 ? item.totalProfit / item.totalQuantitySold : 0
      }))
      .sort((a, b) => b.totalQuantitySold - a.totalQuantitySold)
      .slice(0, parseInt(limit));

    
    const summary = {
      totalItems: topSellingItems.length,
      totalQuantitySold: topSellingItems.reduce((sum, item) => sum + item.totalQuantitySold, 0),
      totalRevenue: topSellingItems.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalProfit: topSellingItems.reduce((sum, item) => sum + item.totalProfit, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        items: topSellingItems
      }
    });
  } catch (error) {
    console.error('Get top selling items error:', error);
    next(error);
  }
};




const getCustomerReport = async (req, res, next) => {
  try {
    const { startDate, endDate, email, sortBy = 'totalSpent' } = req.query;

    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    
    const query = { status: { $ne: 'cancelled' }, ...dateFilter };
    if (email) query['customer.email'] = email.toLowerCase();

    const invoices = await Invoice.find(query)
      .populate('items.inventory', 'pricing')
      .sort({ invoiceDate: -1 });

    
    const customerData = {};
    invoices.forEach(invoice => {
      const customerKey = invoice.customer.email || invoice.customer.name;

      if (!customerData[customerKey]) {
        customerData[customerKey] = {
          name: invoice.customer.name,
          email: invoice.customer.email,
          phone: invoice.customer.phone,
          totalInvoices: 0,
          totalSpent: 0,
          totalProfit: 0,
          lastPurchaseDate: invoice.invoiceDate,
          firstPurchaseDate: invoice.invoiceDate,
          averageOrderValue: 0,
          itemsPurchased: 0,
          invoices: []
        };
      }

      customerData[customerKey].totalInvoices += 1;
      customerData[customerKey].totalSpent += invoice.totalAmount;
      customerData[customerKey].itemsPurchased += invoice.items.reduce((sum, item) => sum + item.quantity, 0);

      
      let invoiceProfit = 0;
      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          invoiceProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
        }
      });
      customerData[customerKey].totalProfit += invoiceProfit;

      
      if (invoice.invoiceDate > customerData[customerKey].lastPurchaseDate) {
        customerData[customerKey].lastPurchaseDate = invoice.invoiceDate;
      }
      if (invoice.invoiceDate < customerData[customerKey].firstPurchaseDate) {
        customerData[customerKey].firstPurchaseDate = invoice.invoiceDate;
      }

      
      customerData[customerKey].invoices.push({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus
      });
    });

    
    let customers = Object.values(customerData).map(customer => ({
      ...customer,
      averageOrderValue: customer.totalInvoices > 0 ? customer.totalSpent / customer.totalInvoices : 0
    }));

    
    if (sortBy === 'totalSpent') {
      customers.sort((a, b) => b.totalSpent - a.totalSpent);
    } else if (sortBy === 'totalInvoices') {
      customers.sort((a, b) => b.totalInvoices - a.totalInvoices);
    } else if (sortBy === 'lastPurchase') {
      customers.sort((a, b) => new Date(b.lastPurchaseDate) - new Date(a.lastPurchaseDate));
    }

    
    const summary = {
      totalCustomers: customers.length,
      totalRevenue: customers.reduce((sum, c) => sum + c.totalSpent, 0),
      totalProfit: customers.reduce((sum, c) => sum + c.totalProfit, 0),
      averageCustomerValue: customers.length > 0 ?
        customers.reduce((sum, c) => sum + c.totalSpent, 0) / customers.length : 0,
      totalInvoices: customers.reduce((sum, c) => sum + c.totalInvoices, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        customers
      }
    });
  } catch (error) {
    console.error('Get customer report error:', error);
    next(error);
  }
};




const getLowStockReport = async (req, res, next) => {
  try {
    const { category, includeReorderOnly = 'false' } = req.query;

    const query = { isActive: true };
    if (category) query.category = category;

    const items = await Inventory.find(query)
      .populate('createdBy', 'username fullName')
      .sort({ 'quantity.current': 1 });

    
    const filteredItems = items.filter(item => {
      if (includeReorderOnly === 'true') {
        return item.needsReorder;
      }
      return item.isLowStock;
    });

    const lowStockItems = filteredItems.map(item => {
      const daysOfStockLeft = item.quantity.current; 
      const suggestedOrderQuantity = Math.max(
        item.supplier.minimumOrderQuantity,
        item.quantity.minimum - item.quantity.current + 20
      );
      const orderCost = suggestedOrderQuantity * item.pricing.purchasePrice;

      return {
        id: item._id,
        itemName: item.itemName,
        skuCode: item.skuCode,
        category: item.category,
        currentStock: item.quantity.current,
        minimumStock: item.quantity.minimum,
        reorderPoint: item.supplier.reorderPoint,
        unit: item.quantity.unit,
        status: item.needsReorder ? 'Needs Reorder' : 'Low Stock',
        daysOfStockLeft,
        supplier: {
          name: item.supplier.name,
          contactPerson: item.supplier.contactPerson,
          email: item.supplier.email,
          phone: item.supplier.phone,
          address: item.supplier.address,
          leadTime: item.supplier.leadTime,
          minimumOrderQuantity: item.supplier.minimumOrderQuantity
        },
        pricing: {
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice
        },
        suggestedOrderQuantity,
        orderCost,
        priority: item.quantity.current <= item.supplier.reorderPoint ? 'High' :
                  item.quantity.current <= item.quantity.minimum ? 'Medium' : 'Low'
      };
    });

    
    lowStockItems.sort((a, b) => {
      const priorityOrder = { 'High': 3, 'Medium': 2, 'Low': 1 };
      if (priorityOrder[b.priority] !== priorityOrder[a.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return a.currentStock - b.currentStock;
    });

    
    const summary = {
      totalItems: lowStockItems.length,
      highPriority: lowStockItems.filter(i => i.priority === 'High').length,
      mediumPriority: lowStockItems.filter(i => i.priority === 'Medium').length,
      lowPriority: lowStockItems.filter(i => i.priority === 'Low').length,
      totalOrderCost: lowStockItems.reduce((sum, item) => sum + item.orderCost, 0)
    };

    res.status(200).json({
      success: true,
      data: {
        summary,
        items: lowStockItems
      }
    });
  } catch (error) {
    console.error('Get low stock report error:', error);
    next(error);
  }
};




const getProfitAnalysis = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy = 'month' } = req.query;

    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) dateFilter.invoiceDate.$gte = new Date(startDate);
      if (endDate) dateFilter.invoiceDate.$lte = new Date(endDate);
    }

    
    const invoiceQuery = { status: { $ne: 'cancelled' }, ...dateFilter };
    const invoices = await Invoice.find(invoiceQuery)
      .populate('items.inventory', 'pricing category')
      .sort({ invoiceDate: 1 });

    
    const inventory = await Inventory.find({ isActive: true });

    
    const profitByPeriod = {};
    invoices.forEach(invoice => {
      let periodKey;
      const date = new Date(invoice.invoiceDate);

      if (groupBy === 'day') {
        periodKey = date.toISOString().split('T')[0];
      } else if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        periodKey = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else if (groupBy === 'year') {
        periodKey = String(date.getFullYear());
      }

      if (!profitByPeriod[periodKey]) {
        profitByPeriod[periodKey] = {
          period: periodKey,
          revenue: 0,
          cost: 0,
          profit: 0,
          profitMargin: 0,
          invoices: 0
        };
      }

      profitByPeriod[periodKey].revenue += invoice.totalAmount;
      profitByPeriod[periodKey].invoices += 1;

      
      invoice.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          profitByPeriod[periodKey].cost += itemCost;
          profitByPeriod[periodKey].profit += item.subtotal - itemCost;
        }
      });
    });

    
    const chartData = Object.values(profitByPeriod)
      .map(period => ({
        ...period,
        profitMargin: period.revenue > 0 ? ((period.profit / period.revenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    
    const categoryProfit = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const itemCategory = item.inventory?.category || 'Uncategorized';

        if (!categoryProfit[itemCategory]) {
          categoryProfit[itemCategory] = {
            category: itemCategory,
            revenue: 0,
            cost: 0,
            profit: 0,
            profitMargin: 0,
            itemsSold: 0
          };
        }

        categoryProfit[itemCategory].revenue += item.subtotal;
        categoryProfit[itemCategory].itemsSold += item.quantity;

        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          categoryProfit[itemCategory].cost += itemCost;
          categoryProfit[itemCategory].profit += item.subtotal - itemCost;
        }
      });
    });

    
    const categoryChartData = Object.values(categoryProfit)
      .map(cat => ({
        ...cat,
        profitMargin: cat.revenue > 0 ? ((cat.profit / cat.revenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.profit - a.profit);

    
    const totalRevenue = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
    let totalCost = 0;
    let totalProfit = 0;

    invoices.forEach(inv => {
      inv.items.forEach(item => {
        if (item.inventory && item.inventory.pricing) {
          const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
          totalCost += itemCost;
          totalProfit += item.subtotal - itemCost;
        }
      });
    });

    const totalInvoices = invoices.length;

    
    const inventoryValue = inventory.reduce((sum, item) => {
      return sum + (item.pricing.sellingPrice * item.quantity.current);
    }, 0);
    const inventoryCost = inventory.reduce((sum, item) => {
      return sum + (item.pricing.purchasePrice * item.quantity.current);
    }, 0);
    const potentialProfit = inventoryValue - inventoryCost;

    
    const itemProfitMap = {};
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const key = item.skuCode || item.itemName;
        if (!itemProfitMap[key]) {
          itemProfitMap[key] = {
            itemName: item.itemName,
            skuCode: item.skuCode,
            category: item.inventory?.category || 'Uncategorized',
            totalProfit: 0,
            totalRevenue: 0,
            quantitySold: 0
          };
        }

        itemProfitMap[key].totalRevenue += item.subtotal;
        itemProfitMap[key].quantitySold += item.quantity;

        if (item.inventory && item.inventory.pricing) {
          const itemProfit = item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
          itemProfitMap[key].totalProfit += itemProfit;
        }
      });
    });

    const topProfitableItems = Object.values(itemProfitMap)
      .map(item => ({
        ...item,
        profitMargin: item.totalRevenue > 0 ? ((item.totalProfit / item.totalRevenue) * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalCost,
          totalProfit,
          totalInvoices,
          overallProfitMargin: totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0,
          averageInvoiceProfit: totalInvoices > 0 ? (totalProfit / totalInvoices).toFixed(2) : 0,
          inventoryValue,
          inventoryCost,
          potentialProfit
        },
        chartData,
        categoryChartData,
        topProfitableItems
      }
    });
  } catch (error) {
    console.error('Get profit analysis error:', error);
    next(error);
  }
};




const exportReportToCSV = async (req, res, next) => {
  try {
    const { type } = req.params;
    const queryParams = req.query;

    let data = [];
    let fields = [];
    let filename = `${type}-report`;

    
    switch (type) {
      case 'sales':
        const salesQuery = { status: { $ne: 'cancelled' } };
        if (queryParams.startDate) salesQuery.invoiceDate = { $gte: new Date(queryParams.startDate) };
        if (queryParams.endDate) {
          salesQuery.invoiceDate = salesQuery.invoiceDate || {};
          salesQuery.invoiceDate.$lte = new Date(queryParams.endDate);
        }

        const invoices = await Invoice.find(salesQuery)
          .populate('items.inventory', 'pricing')
          .sort({ invoiceDate: -1 });

        data = invoices.map(inv => {
          let totalCost = 0;
          let totalProfit = 0;

          inv.items.forEach(item => {
            if (item.inventory && item.inventory.pricing) {
              const itemCost = item.inventory.pricing.purchasePrice * item.quantity;
              totalCost += itemCost;
              totalProfit += item.subtotal - itemCost;
            }
          });

          return {
            invoiceNumber: inv.invoiceNumber,
            customerName: inv.customer.name,
            customerEmail: inv.customer.email,
            invoiceDate: new Date(inv.invoiceDate).toISOString().split('T')[0],
            subtotal: inv.subtotalAmount,
            tax: inv.taxAmount,
            discount: inv.discount.amount,
            totalAmount: inv.totalAmount,
            totalCost: totalCost.toFixed(2),
            totalProfit: totalProfit.toFixed(2),
            status: inv.status,
            paymentStatus: inv.paymentStatus
          };
        });

        fields = ['invoiceNumber', 'customerName', 'customerEmail', 'invoiceDate', 'subtotal', 'tax', 'discount', 'totalAmount', 'totalCost', 'totalProfit', 'status', 'paymentStatus'];
        break;

      case 'inventory':
        const items = await Inventory.find({ isActive: true });
        data = items.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          unit: item.quantity.unit,
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice,
          profitMargin: item.pricing.profitMargin.toFixed(2),
          totalValue: (item.pricing.sellingPrice * item.quantity.current).toFixed(2),
          supplierName: item.supplier.name,
          supplierEmail: item.supplier.email,
          status: item.isLowStock ? 'Low Stock' : 'Adequate'
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'unit', 'purchasePrice', 'sellingPrice', 'profitMargin', 'totalValue', 'supplierName', 'supplierEmail', 'status'];
        break;

      case 'stock-summary':
        const stockItems = await Inventory.find({ isActive: true });
        data = stockItems.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          unit: item.quantity.unit,
          purchasePrice: item.pricing.purchasePrice,
          sellingPrice: item.pricing.sellingPrice,
          totalValue: (item.pricing.sellingPrice * item.quantity.current).toFixed(2),
          status: item.isLowStock ? 'Low Stock' : 'Adequate'
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'unit', 'purchasePrice', 'sellingPrice', 'totalValue', 'status'];
        break;

      case 'low-stock':
        const lowStockItems = await Inventory.find({ isActive: true });
        const filtered = lowStockItems.filter(item => item.isLowStock);
        data = filtered.map(item => ({
          skuCode: item.skuCode,
          itemName: item.itemName,
          category: item.category,
          currentStock: item.quantity.current,
          minimumStock: item.quantity.minimum,
          reorderPoint: item.supplier.reorderPoint,
          supplierName: item.supplier.name,
          supplierEmail: item.supplier.email,
          supplierPhone: item.supplier.phone,
          leadTime: item.supplier.leadTime,
          minimumOrderQuantity: item.supplier.minimumOrderQuantity
        }));
        fields = ['skuCode', 'itemName', 'category', 'currentStock', 'minimumStock', 'reorderPoint', 'supplierName', 'supplierEmail', 'supplierPhone', 'leadTime', 'minimumOrderQuantity'];
        break;

      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }

    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);

    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${Date.now()}.csv"`);
    res.status(200).send(csv);

  } catch (error) {
    console.error('Export to CSV error:', error);
    next(error);
  }
};




const exportReportToPDF = async (req, res, next) => {
  try {
    const { type } = req.params;
    const queryParams = req.query;

    
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${Date.now()}.pdf"`);

    
    doc.pipe(res);

    
    doc.fontSize(20).text(`${type.toUpperCase().replace('-', ' ')} REPORT`, { align: 'center' });
    doc.fontSize(10).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    
    switch (type) {
      case 'sales':
        const salesQuery = { status: { $ne: 'cancelled' } };
        if (queryParams.startDate) salesQuery.invoiceDate = { $gte: new Date(queryParams.startDate) };
        if (queryParams.endDate) {
          salesQuery.invoiceDate = salesQuery.invoiceDate || {};
          salesQuery.invoiceDate.$lte = new Date(queryParams.endDate);
        }

        const invoices = await Invoice.find(salesQuery)
          .populate('items.inventory', 'pricing')
          .sort({ invoiceDate: -1 })
          .limit(50);

        let totalSales = 0;
        let totalProfit = 0;

        invoices.forEach(inv => {
          totalSales += inv.totalAmount;
          inv.items.forEach(item => {
            if (item.inventory && item.inventory.pricing) {
              totalProfit += item.subtotal - (item.inventory.pricing.purchasePrice * item.quantity);
            }
          });
        });

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Invoices: ${invoices.length}`);
        doc.text(`Total Sales: $${totalSales.toFixed(2)}`);
        doc.text(`Total Profit: $${totalProfit.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(14).text('Invoice Details', { underline: true });
        doc.fontSize(9);

        invoices.forEach((inv, index) => {
          if (index > 0 && index % 15 === 0) {
            doc.addPage();
          }
          doc.text(
            `${inv.invoiceNumber} | ${inv.customer.name} | ${new Date(inv.invoiceDate).toLocaleDateString()} | $${inv.totalAmount.toFixed(2)}`,
            { width: 500 }
          );
        });
        break;

      case 'inventory':
        const items = await Inventory.find({ isActive: true }).limit(100);
        const totalValue = items.reduce((sum, item) => sum + (item.pricing.sellingPrice * item.quantity.current), 0);

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Items: ${items.length}`);
        doc.text(`Total Inventory Value: $${totalValue.toFixed(2)}`);
        doc.moveDown();

        doc.fontSize(14).text('Item Details', { underline: true });
        doc.fontSize(8);

        items.forEach((item, index) => {
          if (index > 0 && index % 20 === 0) {
            doc.addPage();
          }
          const itemValue = item.pricing.sellingPrice * item.quantity.current;
          doc.text(
            `${item.skuCode} | ${item.itemName} | Stock: ${item.quantity.current} | Value: $${itemValue.toFixed(2)}`,
            { width: 500 }
          );
        });
        break;

      case 'low-stock':
        const allItems = await Inventory.find({ isActive: true });
        const lowStockItems = allItems.filter(item => item.isLowStock);

        doc.fontSize(14).text('Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Low Stock Items: ${lowStockItems.length}`);
        doc.moveDown();

        doc.fontSize(14).text('Items Requiring Attention', { underline: true });
        doc.fontSize(9);

        lowStockItems.forEach((item, index) => {
          if (index > 0 && index % 18 === 0) {
            doc.addPage();
          }
          doc.text(
            `${item.skuCode} | ${item.itemName} | Current: ${item.quantity.current} | Min: ${item.quantity.minimum} | Supplier: ${item.supplier.name}`,
            { width: 500 }
          );
        });
        break;

      default:
        doc.text('Report type not supported for PDF export');
    }

    
    doc.end();

  } catch (error) {
    console.error('Export to PDF error:', error);
    next(error);
  }
};




const getRecentActivity = async (req, res, next) => {
  try {
    const { limit = 20 } = req.query;

    
    const activities = await AuditLog.find()
      .populate('performedBy', 'username fullName role')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities: activities.map(activity => ({
          id: activity._id,
          action: activity.action,
          resource: activity.resource,
          resourceId: activity.resourceId,
          performedBy: {
            id: activity.performedBy?._id,
            username: activity.performedBy?.username,
            fullName: activity.performedBy?.fullName,
            role: activity.performedBy?.role
          },
          details: activity.details,
          timestamp: activity.timestamp,
          ipAddress: activity.ipAddress
        }))
      }
    });
  } catch (error) {
    console.error('Get recent activity error:', error);
    next(error);
  }
};

module.exports = {
  getDashboard,
  getStockSummary,
  getProfitMarginReport,
  getReorderList,
  getAuditLogs,
  getSalesReport,
  getInventoryValuation,
  getTopSellingItems,
  getCustomerReport,
  getLowStockReport,
  getProfitAnalysis,
  getRecentActivity,
  exportReportToCSV,
  exportReportToPDF
};
