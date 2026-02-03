const Invoice = require('../models/Invoice');
const Inventory = require('../models/Inventory');
const AuditLog = require('../models/AuditLog');
const PDFDocument = require('pdfkit');




const createInvoice = async (req, res, next) => {
  try {
    const { items, customer, taxRate, discount, notes, remarks, dueDate, paymentMethod } = req.body;

    
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'At least one item is required',
          code: 'ITEMS_REQUIRED'
        }
      });
    }

    
    const processedItems = [];
    for (const item of items) {
      const inventoryItem = await Inventory.findById(item.inventory);

      if (!inventoryItem) {
        return res.status(404).json({
          success: false,
          error: {
            message: `Inventory item with ID ${item.inventory} not found`,
            code: 'INVENTORY_NOT_FOUND'
          }
        });
      }

      if (!inventoryItem.isActive) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Item ${inventoryItem.itemName} is not active`,
            code: 'ITEM_INACTIVE'
          }
        });
      }

      
      if (inventoryItem.quantity.current < item.quantity) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Insufficient stock for ${inventoryItem.itemName}. Available: ${inventoryItem.quantity.current}, Requested: ${item.quantity}`,
            code: 'INSUFFICIENT_STOCK'
          }
        });
      }

      processedItems.push({
        inventory: inventoryItem._id,
        itemName: inventoryItem.itemName,
        skuCode: inventoryItem.skuCode,
        quantity: item.quantity,
        unit: inventoryItem.quantity.unit || 'pieces',
        priceAtSale: item.priceAtSale || inventoryItem.pricing.sellingPrice,
        subtotal: 0 
      });
    }

    
    const calculatedDueDate = dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    
    const invoiceNumber = await Invoice.generateInvoiceNumber();

    
    const invoice = await Invoice.create({
      invoiceNumber,
      customer,
      items: processedItems,
      amounts: amounts || {}, 
      taxRate: taxRate || 0,
      discount: discount || { type: 'percentage', value: 0, amount: 0 },
      notes,
      remarks,
      dueDate: calculatedDueDate,
      paymentMethod,
      createdBy: req.user.id,
      lastUpdatedBy: req.user.id
    });

    
    for (const item of processedItems) {
      const inventoryItem = await Inventory.findById(item.inventory);
      const previousQuantity = inventoryItem.quantity.current;
      const newQuantity = previousQuantity - item.quantity;

      inventoryItem.quantity.current = newQuantity;
      inventoryItem.stockHistory.push({
        action: 'removed',
        quantity: item.quantity,
        previousQuantity,
        newQuantity,
        reason: `Invoice #${invoice.invoiceNumber} created`,
        updatedBy: req.user.id
      });
      inventoryItem.lastUpdatedBy = req.user.id;

      await inventoryItem.save();
    }

    
    await AuditLog.create({
      action: 'CREATE',
      resource: 'INVOICE',
      resourceId: invoice._id,
      performedBy: req.user.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        customer: invoice.customer.name,
        total: invoice.totalAmount,
        itemCount: invoice.items.length
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    
    const populatedInvoice = await Invoice.findOne({ _id: invoice._id, isDeleted: false })
      .populate('items.inventory', 'itemName skuCode category quantity pricing')
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    res.status(201).json({
      success: true,
      data: { invoice: populatedInvoice },
      message: 'Invoice created successfully'
    });
  } catch (error) {
    console.error('Create invoice error:', error);
    next(error);
  }
};




const getAllInvoices = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      paymentStatus,
      customer,
      startDate,
      endDate,
      search,
      itemId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;


    const query = { isDeleted: false };


    if (itemId) {
      query['items.inventory'] = itemId;
      query.status = { $in: ['issued', 'paid'] };
    }


    if (status && !itemId) {
      query.status = status;
    }


    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }


    if (customer) {
      query['customer.name'] = { $regex: customer, $options: 'i' };
    }


    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) {
        query.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.invoiceDate.$lte = new Date(endDate);
      }
    }


    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await Invoice.countDocuments(query);


    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const invoices = await Invoice.find(query)
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName')
      .populate('items.inventory', 'itemName skuCode category quantity pricing')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Get all invoices error:', error);
    next(error);
  }
};




const getInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false })
      .populate('items.inventory', 'itemName skuCode category quantity pricing')
      .populate('createdBy', 'username fullName email')
      .populate('lastUpdatedBy', 'username fullName email');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: { invoice }
    });
  } catch (error) {
    console.error('Get invoice error:', error);
    next(error);
  }
};




const updateInvoice = async (req, res, next) => {
  try {
    let invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot update a cancelled invoice',
          code: 'INVOICE_CANCELLED'
        }
      });
    }

    
    if (invoice.status === 'paid' && req.body.items) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot modify items of a paid invoice',
          code: 'INVOICE_PAID'
        }
      });
    }

    
    if (req.body.items) {
      
      for (const item of invoice.items) {
        const inventoryItem = await Inventory.findById(item.inventory);
        if (inventoryItem) {
          const previousQuantity = inventoryItem.quantity.current;
          const newQuantity = previousQuantity + item.quantity;

          inventoryItem.quantity.current = newQuantity;
          inventoryItem.stockHistory.push({
            action: 'added',
            quantity: item.quantity,
            previousQuantity,
            newQuantity,
            reason: `Invoice #${invoice.invoiceNumber} updated - stock restored`,
            updatedBy: req.user.id
          });
          inventoryItem.lastUpdatedBy = req.user.id;

          await inventoryItem.save();
        }
      }

      
      const processedItems = [];
      for (const item of req.body.items) {
        const inventoryItem = await Inventory.findById(item.inventory);

        if (!inventoryItem) {
          return res.status(404).json({
            success: false,
            error: {
              message: `Inventory item with ID ${item.inventory} not found`,
              code: 'INVENTORY_NOT_FOUND'
            }
          });
        }

        if (!inventoryItem.isActive) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Item ${inventoryItem.itemName} is not active`,
              code: 'ITEM_INACTIVE'
            }
          });
        }

        
        if (inventoryItem.quantity.current < item.quantity) {
          return res.status(400).json({
            success: false,
            error: {
              message: `Insufficient stock for ${inventoryItem.itemName}. Available: ${inventoryItem.quantity.current}, Requested: ${item.quantity}`,
              code: 'INSUFFICIENT_STOCK'
            }
          });
        }

        processedItems.push({
          inventory: inventoryItem._id,
          itemName: inventoryItem.itemName,
          skuCode: inventoryItem.skuCode,
          quantity: item.quantity,
          unit: inventoryItem.quantity.unit || 'pieces',
          priceAtSale: item.priceAtSale || inventoryItem.pricing.sellingPrice,
          subtotal: 0 
        });
      }

      
      for (const item of processedItems) {
        const inventoryItem = await Inventory.findById(item.inventory);
        const previousQuantity = inventoryItem.quantity.current;
        const newQuantity = previousQuantity - item.quantity;

        inventoryItem.quantity.current = newQuantity;
        inventoryItem.stockHistory.push({
          action: 'removed',
          quantity: item.quantity,
          previousQuantity,
          newQuantity,
          reason: `Invoice #${invoice.invoiceNumber} updated`,
          updatedBy: req.user.id
        });
        inventoryItem.lastUpdatedBy = req.user.id;

        await inventoryItem.save();
      }

      req.body.items = processedItems;
    }

    
    const allowedUpdates = ['customer', 'items', 'taxRate', 'discount', 'notes', 'remarks', 'status', 'paymentStatus', 'paymentMethod', 'dueDate'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        invoice[field] = req.body[field];
      }
    });

    invoice.lastUpdatedBy = req.user.id;
    await invoice.save();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVOICE',
      resourceId: invoice._id,
      performedBy: req.user.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        updates: Object.keys(req.body)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    
    const populatedInvoice = await Invoice.findOne({ _id: invoice._id, isDeleted: false })
      .populate('items.inventory', 'itemName skuCode category')
      .populate('createdBy', 'username fullName')
      .populate('lastUpdatedBy', 'username fullName');

    res.status(200).json({
      success: true,
      data: { invoice: populatedInvoice },
      message: 'Invoice updated successfully'
    });
  } catch (error) {
    console.error('Update invoice error:', error);
    next(error);
  }
};




const deleteInvoice = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    if (invoice.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invoice already cancelled',
          code: 'INVOICE_ALREADY_CANCELLED'
        }
      });
    }

    
    if (invoice.status === 'paid') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Cannot delete a paid invoice',
          code: 'INVOICE_PAID'
        }
      });
    }

    
    for (const item of invoice.items) {
      const inventoryItem = await Inventory.findById(item.inventory);
      if (inventoryItem) {
        const previousQuantity = inventoryItem.quantity.current;
        const newQuantity = previousQuantity + item.quantity;

        inventoryItem.quantity.current = newQuantity;
        inventoryItem.stockHistory.push({
          action: 'added',
          quantity: item.quantity,
          previousQuantity,
          newQuantity,
          reason: `Invoice #${invoice.invoiceNumber} cancelled - stock restored`,
          updatedBy: req.user.id
        });
        inventoryItem.lastUpdatedBy = req.user.id;

        await inventoryItem.save();
      }
    }

    
    invoice.status = 'cancelled';
    invoice.paymentStatus = 'cancelled';
    invoice.isDeleted = true;
    invoice.deletedAt = Date.now();
    invoice.deletedBy = req.user.id;
    invoice.lastUpdatedBy = req.user.id;
    await invoice.save();

    
    await AuditLog.create({
      action: 'DELETE',
      resource: 'INVOICE',
      resourceId: invoice._id,
      performedBy: req.user.id,
      details: {
        invoiceNumber: invoice.invoiceNumber,
        customer: invoice.customer.name,
        total: invoice.totalAmount
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Invoice cancelled successfully'
    });
  } catch (error) {
    console.error('Delete invoice error:', error);
    next(error);
  }
};




const generateInvoicePDF = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false })
      .populate('items.inventory', 'itemName skuCode')
      .populate('createdBy', 'username fullName');

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    
    const doc = new PDFDocument({ margin: 50 });

    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);

    
    doc.pipe(res);

    
    doc.fontSize(20).text('Your Company Name', 50, 50);
    doc.fontSize(10)
      .text('123 Business Street', 50, 75)
      .text('City, State 12345', 50, 90)
      .text('Email: company@example.com', 50, 105)
      .text('Phone: (123) 456-7890', 50, 120);

    
    doc.fontSize(25).text('INVOICE', 400, 50);
    doc.fontSize(10)
      .text(`Invoice #: ${invoice.invoiceNumber}`, 400, 85)
      .text(`Date: ${new Date(invoice.invoiceDate).toLocaleDateString()}`, 400, 100)
      .text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}`, 400, 115)
      .text(`Status: ${invoice.status.toUpperCase()}`, 400, 130);

    
    doc.fontSize(12).text('Bill To:', 50, 170);
    doc.fontSize(10)
      .text(invoice.customer.name, 50, 190)
      .text(invoice.customer.email || '', 50, 205)
      .text(invoice.customer.phone || '', 50, 220);

    if (invoice.customer.address?.street) {
      doc.text(invoice.customer.address.street, 50, 235)
        .text(`${invoice.customer.address.city || ''}, ${invoice.customer.address.state || ''} ${invoice.customer.address.zipCode || ''}`, 50, 250);
    }

    
    const tableTop = 300;
    const itemHeight = 30;

    
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Item', 50, tableTop);
    doc.text('SKU', 200, tableTop);
    doc.text('Qty', 280, tableTop);
    doc.text('Unit Price', 340, tableTop);
    doc.text('Total', 450, tableTop);

    
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    
    doc.font('Helvetica');
    let yPosition = tableTop + 25;

    invoice.items.forEach((item) => {
      doc.text(item.itemName, 50, yPosition, { width: 140 });
      doc.text(item.skuCode, 200, yPosition);
      doc.text(`${item.quantity} ${item.unit}`, 280, yPosition);
      doc.text(`$${item.priceAtSale.toFixed(2)}`, 340, yPosition);
      doc.text(`$${item.subtotal.toFixed(2)}`, 450, yPosition);
      yPosition += itemHeight;
    });

    
    yPosition += 10;
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

    
    yPosition += 20;
    doc.text('Subtotal:', 350, yPosition);
    doc.text(`$${invoice.subtotalAmount.toFixed(2)}`, 450, yPosition);

    if (invoice.discount.amount > 0) {
      yPosition += 20;
      doc.text(`Discount (${invoice.discount.type === 'percentage' ? invoice.discount.value + '%' : 'Fixed'}):`, 350, yPosition);
      doc.text(`-$${invoice.discount.amount.toFixed(2)}`, 450, yPosition);
    }

    if (invoice.taxAmount > 0) {
      yPosition += 20;
      doc.text(`Tax (${invoice.taxRate}%):`, 350, yPosition);
      doc.text(`$${invoice.taxAmount.toFixed(2)}`, 450, yPosition);
    }

    yPosition += 20;
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Total Amount:', 350, yPosition);
    doc.text(`$${invoice.totalAmount.toFixed(2)}`, 450, yPosition);

    
    doc.fontSize(10).font('Helvetica');
    yPosition += 40;

    if (invoice.paymentStatus === 'paid') {
      doc.text(`Payment Status: PAID`, 50, yPosition);
      yPosition += 15;
      if (invoice.paymentMethod) {
        doc.text(`Payment Method: ${invoice.paymentMethod.toUpperCase()}`, 50, yPosition);
        yPosition += 15;
      }
      if (invoice.paymentDate) {
        doc.text(`Payment Date: ${new Date(invoice.paymentDate).toLocaleDateString()}`, 50, yPosition);
        yPosition += 15;
      }
    }

    
    yPosition += 20;
    if (invoice.notes) {
      doc.text('Notes:', 50, yPosition);
      yPosition += 15;
      doc.text(invoice.notes, 50, yPosition, { width: 500 });
      yPosition += 30;
    }

    if (invoice.remarks) {
      doc.text('Remarks:', 50, yPosition);
      yPosition += 15;
      doc.text(invoice.remarks, 50, yPosition, { width: 500 });
    }

    
    const footerY = doc.page.height - 100;
    doc.fontSize(8)
      .text('Thank you for your business!', 50, footerY, { align: 'center', width: 500 });

    
    doc.end();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVOICE',
      resourceId: invoice._id,
      performedBy: req.user.id,
      details: {
        action: 'PDF_GENERATED',
        invoiceNumber: invoice.invoiceNumber
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
  } catch (error) {
    console.error('Generate PDF error:', error);
    next(error);
  }
};




const getInvoiceStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.invoiceDate = {};
      if (startDate) {
        dateFilter.invoiceDate.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.invoiceDate.$lte = new Date(endDate);
      }
    }

    
    const totalInvoices = await Invoice.countDocuments(dateFilter);

    
    const invoicesByStatus = await Invoice.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    
    const invoicesByPaymentStatus = await Invoice.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$paymentStatus', count: { $sum: 1 } } }
    ]);

    
    const revenueStats = await Invoice.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          averageInvoice: { $avg: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    
    const pendingPayments = await Invoice.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'pending' } },
      {
        $group: {
          _id: null,
          totalPending: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    
    const overdueInvoices = await Invoice.countDocuments({
      ...dateFilter,
      paymentStatus: 'pending',
      dueDate: { $lt: new Date() }
    });

    
    const topCustomers = await Invoice.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: '$customer.email',
          name: { $first: '$customer.name' },
          totalSpent: { $sum: '$totalAmount' },
          invoiceCount: { $sum: 1 }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);

    
    const monthlyRevenue = await Invoice.aggregate([
      {
        $match: {
          paymentStatus: 'paid',
          invoiceDate: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 12)) }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$invoiceDate' },
            month: { $month: '$invoiceDate' }
          },
          revenue: { $sum: '$totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        overview: {
          totalInvoices,
          paidInvoices: invoicesByPaymentStatus.find(s => s._id === 'paid')?.count || 0,
          pendingInvoices: pendingPayments[0]?.count || 0,
          cancelledInvoices: invoicesByStatus.find(s => s._id === 'cancelled')?.count || 0,
          overdueInvoices,
          totalRevenue: revenueStats[0]?.totalRevenue || 0,
          averageInvoice: revenueStats[0]?.averageInvoice || 0,
          totalPending: pendingPayments[0]?.totalPending || 0
        },
        statusBreakdown: invoicesByStatus,
        paymentStatusBreakdown: invoicesByPaymentStatus,
        topCustomers,
        monthlyRevenue
      }
    });
  } catch (error) {
    console.error('Get invoice stats error:', error);
    next(error);
  }
};




const sendInvoiceEmail = async (req, res, next) => {
  try {
    const invoice = await Invoice.findOne({ _id: req.params.id, isDeleted: false });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Invoice not found',
          code: 'INVOICE_NOT_FOUND'
        }
      });
    }

    if (!invoice.customer.email) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Customer email not found',
          code: 'EMAIL_NOT_FOUND'
        }
      });
    }

    
    
    console.log(`Email would be sent to: ${invoice.customer.email}`);
    console.log(`Invoice: ${invoice.invoiceNumber}`);

    
    if (invoice.status === 'draft') {
      invoice.status = 'issued';
      invoice.lastUpdatedBy = req.user.id;
      await invoice.save();
    }

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'INVOICE',
      resourceId: invoice._id,
      performedBy: req.user.id,
      details: {
        action: 'EMAIL_SENT',
        invoiceNumber: invoice.invoiceNumber,
        recipient: invoice.customer.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      success: true,
      message: 'Invoice email sent successfully (placeholder - email functionality not implemented)',
      data: {
        recipient: invoice.customer.email,
        invoiceNumber: invoice.invoiceNumber
      }
    });
  } catch (error) {
    console.error('Send invoice email error:', error);
    next(error);
  }
};

module.exports = {
  createInvoice,
  getAllInvoices,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  generateInvoicePDF,
  getInvoiceStats,
  sendInvoiceEmail
};
