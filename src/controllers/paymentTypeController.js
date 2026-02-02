const PaymentType = require('../models/PaymentType');
const AuditLog = require('../models/AuditLog');

// Get all payment types
exports.getAllPaymentTypes = async (req, res) => {
  try {
    const { status = 'all' } = req.query;

    const query = { isDeleted: false };
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const paymentTypes = await PaymentType.find(query)
      .populate('createdBy', 'username fullName')
      .sort({ order: 1, createdAt: 1 });

    res.json({ paymentTypes });
  } catch (error) {
    console.error('Error fetching payment types:', error);
    res.status(500).json({ message: 'Error fetching payment types', error: error.message });
  }
};

// Get single payment type
exports.getPaymentTypeById = async (req, res) => {
  try {
    const paymentType = await PaymentType.findOne({ _id: req.params.id, isDeleted: false }).populate('createdBy', 'username fullName');

    if (!paymentType) {
      return res.status(404).json({ message: 'Payment type not found' });
    }

    res.json({ paymentType });
  } catch (error) {
    console.error('Error fetching payment type:', error);
    res.status(500).json({ message: 'Error fetching payment type', error: error.message });
  }
};

// Create new payment type
exports.createPaymentType = async (req, res) => {
  try {
    const { name, displayName, description, icon, isActive, order } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({ message: 'Name and display name are required' });
    }

    // Check if payment type already exists (not deleted)
    const existing = await PaymentType.findOne({ name: name.toLowerCase(), isDeleted: false });
    if (existing) {
      return res.status(400).json({ message: 'Payment type already exists' });
    }

    const paymentType = new PaymentType({
      name: name.toLowerCase(),
      displayName,
      description: description || '',
      icon: icon || 'credit-card',
      isActive: isActive !== undefined ? isActive : true,
      order: order || 0,
      createdBy: req.user.id,
    });

    await paymentType.save();

    // Create audit log
    await AuditLog.create({
      action: 'CREATE',
      resource: 'PAYMENT_TYPE',
      resourceId: paymentType._id,
      performedBy: req.user.id,
      details: {
        name: paymentType.name,
        displayName: paymentType.displayName,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      message: 'Payment type created successfully',
      paymentType,
    });
  } catch (error) {
    console.error('Error creating payment type:', error);
    res.status(500).json({ message: 'Error creating payment type', error: error.message });
  }
};

// Update payment type
exports.updatePaymentType = async (req, res) => {
  try {
    const { name, displayName, description, icon, isActive, order } = req.body;

    const paymentType = await PaymentType.findOne({ _id: req.params.id, isDeleted: false });

    if (!paymentType) {
      return res.status(404).json({ message: 'Payment type not found' });
    }

    // Check if name is being changed and if new name already exists
    if (name && name.toLowerCase() !== paymentType.name) {
      const existing = await PaymentType.findOne({ name: name.toLowerCase() });
      if (existing) {
        return res.status(400).json({ message: 'Payment type name already exists' });
      }
      paymentType.name = name.toLowerCase();
    }

    if (displayName !== undefined) paymentType.displayName = displayName;
    if (description !== undefined) paymentType.description = description;
    if (icon !== undefined) paymentType.icon = icon;
    if (isActive !== undefined) paymentType.isActive = isActive;
    if (order !== undefined) paymentType.order = order;

    await paymentType.save();

    // Create audit log
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'PAYMENT_TYPE',
      resourceId: paymentType._id,
      performedBy: req.user.id,
      details: {
        name: paymentType.name,
        displayName: paymentType.displayName,
        changes: req.body,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({
      message: 'Payment type updated successfully',
      paymentType,
    });
  } catch (error) {
    console.error('Error updating payment type:', error);
    res.status(500).json({ message: 'Error updating payment type', error: error.message });
  }
};

// Delete payment type
exports.deletePaymentType = async (req, res) => {
  try {
    const paymentType = await PaymentType.findOne({ _id: req.params.id, isDeleted: false });

    if (!paymentType) {
      return res.status(404).json({ message: 'Payment type not found' });
    }

    // Soft delete by marking as deleted
    paymentType.isDeleted = true;
    paymentType.deletedAt = Date.now();
    paymentType.deletedBy = req.user?.id || null;
    await paymentType.save();

    // Create audit log
    await AuditLog.create({
      action: 'DELETE',
      resource: 'PAYMENT_TYPE',
      resourceId: paymentType._id,
      performedBy: req.user?.id || null,
      details: {
        name: paymentType.name,
        displayName: paymentType.displayName,
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
    });

    res.json({ message: 'Payment type deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment type:', error);
    res.status(500).json({ message: 'Error deleting payment type', error: error.message });
  }
};
