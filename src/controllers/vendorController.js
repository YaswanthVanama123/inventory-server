const vendorService = require('../services/vendor.service');

class VendorController {
  async createVendor(req, res, next) {
    try {
      const vendor = await vendorService.createVendor(req.body, req.user._id);
      res.status(201).json({
        success: true,
        message: 'Vendor created successfully',
        data: vendor
      });
    } catch (error) {
      console.error('Error creating vendor:', error);
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('required')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to create vendor',
        error: error.message
      });
    }
  }

  async getAllVendors(req, res, next) {
    try {
      const data = await vendorService.getAllVendors();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching vendors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendors',
        error: error.message
      });
    }
  }

  async getActiveVendors(req, res, next) {
    try {
      const data = await vendorService.getActiveVendors();
      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error fetching active vendors:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active vendors',
        error: error.message
      });
    }
  }

  async getVendorById(req, res, next) {
    try {
      const vendor = await vendorService.getVendorById(req.params.id);
      res.json({
        success: true,
        data: vendor
      });
    } catch (error) {
      console.error('Error fetching vendor:', error);
      if (error.message === 'Vendor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to fetch vendor',
        error: error.message
      });
    }
  }

  async updateVendor(req, res, next) {
    try {
      const vendor = await vendorService.updateVendor(
        req.params.id,
        req.body,
        req.user._id
      );
      res.json({
        success: true,
        message: 'Vendor updated successfully',
        data: vendor
      });
    } catch (error) {
      console.error('Error updating vendor:', error);
      if (error.message === 'Vendor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      if (error.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to update vendor',
        error: error.message
      });
    }
  }

  async deleteVendor(req, res, next) {
    try {
      const vendor = await vendorService.deleteVendor(req.params.id);
      res.json({
        success: true,
        message: 'Vendor deleted successfully',
        data: vendor
      });
    } catch (error) {
      console.error('Error deleting vendor:', error);
      if (error.message === 'Vendor not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Failed to delete vendor',
        error: error.message
      });
    }
  }
}

module.exports = new VendorController();
