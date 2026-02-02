const Settings = require('../models/Settings');
const AuditLog = require('../models/AuditLog');


exports.getSettings = async (req, res) => {
  try {
    const settings = await Settings.getSettings();

    res.status(200).json({
      success: true,
      data: {
        categories: settings.categories.filter((c) => c.isActive),
        units: settings.units.filter((u) => u.isActive),
        skuConfig: settings.skuConfig,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch settings',
    });
  }
};


exports.getAllCategories = async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    const { includeInactive } = req.query;

    let categories = settings.categories;
    if (!includeInactive || includeInactive === 'false') {
      categories = categories.filter((c) => c.isActive);
    }

    res.status(200).json({
      success: true,
      data: { categories },
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch categories',
    });
  }
};


exports.addCategory = async (req, res) => {
  try {
    const { value, label } = req.body;

    if (!value || !label) {
      return res.status(400).json({
        success: false,
        message: 'Category value and label are required',
      });
    }

    const settings = await Settings.getSettings();

    
    const exists = settings.categories.some(
      (c) => c.value.toLowerCase() === value.toLowerCase()
    );

    if (exists) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists',
      });
    }

    
    settings.categories.push({
      value: value.toLowerCase().trim(),
      label: label.trim(),
      isActive: true,
      createdBy: req.user._id,
      createdAt: new Date(),
    });

    await settings.save();

    
    await AuditLog.create({
      action: 'CREATE',
      resource: 'Category',
      performedBy: req.user._id,
      details: { category: { value, label } },
    });

    res.status(201).json({
      success: true,
      message: 'Category added successfully',
      data: { category: settings.categories[settings.categories.length - 1] },
    });
  } catch (error) {
    console.error('Error adding category:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to add category',
    });
  }
};


exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { value, label, isActive } = req.body;

    const settings = await Settings.getSettings();
    const category = settings.categories.id(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    
    if (value !== undefined) category.value = value.toLowerCase().trim();
    if (label !== undefined) category.label = label.trim();
    if (isActive !== undefined) category.isActive = isActive;

    await settings.save();

    
    await AuditLog.create({
      action: 'UPDATE',
      resource: 'Category',
      resourceId: id,
      performedBy: req.user._id,
      details: { updates: { value, label, isActive } },
    });

    res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: { category },
    });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update category',
    });
  }
};


exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const settings = await Settings.getSettings();
    const category = settings.categories.id(id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    
    category.isActive = false;
    await settings.save();

    
    await AuditLog.create({
      action: 'DELETE',
      resource: 'Category',
      resourceId: id,
      performedBy: req.user._id,
      details: { category: { value: category.value, label: category.label } },
    });

    res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete category',
    });
  }
};


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
