const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');


exports.getAllUnits = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const { includeInactive } = req.query;

    let units = settings.units;
    if (!includeInactive || includeInactive === 'false') {
      units = units.filter((u) => u.isActive);
    }

    res.status(200).json({
      success: true,
      data: { units },
    });
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch units',
    });
  }
};


exports.addUnit = async (req, res) => {
  try {
    const { value, label } = req.body;

    if (!value || !label) {
      return res.status(400).json({
        success: false,
        message: 'Unit value and label are required',
      });
    }

    const settings = await Settings.getSettings();

    
    const exists = settings.units.some(
      (u) => u.value.toLowerCase() === value.toLowerCase()
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Unit already exists',
      });
    }

    
    settings.units.push({
      value: value.toLowerCase().trim(),
      label: label.trim(),
      isActive: true,
      createdBy: req.user._id,
      createdAt: new Date(),
    });

    await settings.save();

    
    await AuditLog.create({
      action: 'CREATE',
      resource: 'Unit',
      performedBy: req.user._id,
      details: { unit: { value, label } },
    });

    res.status(201).json({
      success: true,
      message: 'Unit added successfully',
      data: { unit: settings.units[settings.units.length - 1] },
    });
  } catch (error) {
    console.error('Error adding unit:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add unit',
    });
  }
};


exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { value, label, isActive } = req.body;

    const settings = await Settings.getSettings();
    const unit = settings.units.id(id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }

    
    if (value !== undefined) unit.value = value.toLowerCase().trim();
    if (label !== undefined) unit.label = label.trim();
    if (isActive !== undefined) unit.isActive = isActive;

    await settings.save();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'Unit',
      resourceId: id,
      performedBy: req.user._id,
      details: { updates: { value, label, isActive } },
    });

    res.status(200).json({
      success: true,
      message: 'Unit updated successfully',
      data: { unit },
    });
  } catch (error) {
    console.error('Error updating unit:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update unit',
    });
  }
};


exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await Settings.getSettings();
    const unit = settings.units.id(id);

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: 'Unit not found',
      });
    }

    
    unit.isActive = false;
    await settings.save();

    
    await AuditLog.create({
      action: 'DELETE',
      resource: 'Unit',
      resourceId: id,
      performedBy: req.user._id,
      details: { unit: { value: unit.value, label: unit.label } },
    });

    res.status(200).json({
      success: true,
      message: 'Unit deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete unit',
    });
  }
};


exports.generateSKU = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const sku = await settings.generateSKU();

    res.status(200).json({
      success: true,
      data: { sku },
    });
  } catch (error) {
    console.error('Error generating SKU:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate SKU',
    });
  }
};


exports.updateSKUConfig = async (req, res) => {
  try {
    const { prefix, format, numberLength } = req.body;

    const settings = await Settings.getSettings();

    if (prefix !== undefined) settings.skuConfig.prefix = prefix.toUpperCase().trim();
    if (format !== undefined) settings.skuConfig.format = format.trim();
    if (numberLength !== undefined) {
      if (numberLength < 1 || numberLength > 10) {
        return res.status(400).json({
          success: false,
          message: 'Number length must be between 1 and 10',
        });
      }
      settings.skuConfig.numberLength = numberLength;
    }

    await settings.save();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'SKU Configuration',
      performedBy: req.user._id,
      details: { updates: { prefix, format, numberLength } },
    });

    res.status(200).json({
      success: true,
      message: 'SKU configuration updated successfully',
      data: { skuConfig: settings.skuConfig },
    });
  } catch (error) {
    console.error('Error updating SKU config:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update SKU configuration',
    });
  }
};


exports.getStockCutoffDate = async (req, res) => {
  try {
    const settings = await Settings.getSettings();

    res.status(200).json({
      success: true,
      data: {
        stockCalculationCutoffDate: settings.stockCalculationCutoffDate
      },
    });
  } catch (error) {
    console.error('Error fetching cutoff date:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch cutoff date',
    });
  }
};


exports.updateStockCutoffDate = async (req, res) => {
  try {
    const { cutoffDate } = req.body;

    if (!cutoffDate) {
      return res.status(400).json({
        success: false,
        message: 'Cutoff date is required',
      });
    }

    const settings = await Settings.getSettings();
    settings.stockCalculationCutoffDate = new Date(cutoffDate);
    await settings.save();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'Stock Calculation Cutoff Date',
      performedBy: req.user._id,
      details: { cutoffDate: settings.stockCalculationCutoffDate },
    });

    res.status(200).json({
      success: true,
      message: 'Stock calculation cutoff date updated successfully',
      data: {
        stockCalculationCutoffDate: settings.stockCalculationCutoffDate
      },
    });
  } catch (error) {
    console.error('Error updating cutoff date:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update cutoff date',
    });
  }
};
