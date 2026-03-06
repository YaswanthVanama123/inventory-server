const Vendor = require('../models/Vendor');

class VendorService {
  async createVendor(vendorData, userId) {
    const { name, email, phone, address, notes } = vendorData;

    if (!name) {
      throw new Error('Vendor name is required');
    }

    // Check if vendor already exists
    const existing = await Vendor.getVendorByName(name);
    if (existing) {
      throw new Error(`Vendor '${name}' already exists`);
    }

    const vendor = new Vendor({
      name,
      email,
      phone,
      address,
      notes,
      createdBy: userId,
      lastUpdatedBy: userId
    });

    return await vendor.save();
  }

  async getAllVendors() {
    const vendors = await Vendor.getAllVendors();
    return {
      vendors,
      total: vendors.length
    };
  }

  async getActiveVendors() {
    const vendors = await Vendor.getActiveVendors();
    return {
      vendors,
      total: vendors.length
    };
  }

  async getVendorById(vendorId) {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    return vendor;
  }

  async updateVendor(vendorId, updateData, userId) {
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }

    // Check if name is being changed and new name already exists
    if (updateData.name && updateData.name !== vendor.name) {
      const existing = await Vendor.getVendorByName(updateData.name);
      if (existing) {
        throw new Error(`Vendor '${updateData.name}' already exists`);
      }
    }

    // Update fields
    if (updateData.name) vendor.name = updateData.name;
    if (updateData.email !== undefined) vendor.email = updateData.email;
    if (updateData.phone !== undefined) vendor.phone = updateData.phone;
    if (updateData.address !== undefined) vendor.address = updateData.address;
    if (updateData.notes !== undefined) vendor.notes = updateData.notes;
    if (updateData.isActive !== undefined) vendor.isActive = updateData.isActive;

    vendor.lastUpdatedBy = userId;

    return await vendor.save();
  }

  async deleteVendor(vendorId) {
    const vendor = await Vendor.findByIdAndDelete(vendorId);
    if (!vendor) {
      throw new Error('Vendor not found');
    }
    return vendor;
  }
}

module.exports = new VendorService();
