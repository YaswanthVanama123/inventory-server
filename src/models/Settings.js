const mongoose = require('mongoose');

/**
 * Settings Model
 * Stores system-wide configuration including categories and units
 */
const settingsSchema = new mongoose.Schema(
  {
    // Categories for inventory items
    categories: [
      {
        value: {
          type: String,
          required: true,
          unique: true,
          trim: true,
          lowercase: true,
        },
        label: {
          type: String,
          required: true,
          trim: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Unit types for inventory items
    units: [
      {
        value: {
          type: String,
          required: true,
          unique: true,
          trim: true,
          lowercase: true,
        },
        label: {
          type: String,
          required: true,
          trim: true,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // SKU configuration
    skuConfig: {
      prefix: {
        type: String,
        default: 'SKU',
        trim: true,
        uppercase: true,
      },
      lastNumber: {
        type: Number,
        default: 0,
      },
      format: {
        type: String,
        default: '{PREFIX}-{YEAR}{MONTH}-{NUMBER}',
        // Supports: {PREFIX}, {YEAR}, {MONTH}, {DAY}, {NUMBER}
      },
      numberLength: {
        type: Number,
        default: 4, // Zero-padded length for the number
      },
    },

    // Singleton pattern - only one settings document
    singleton: {
      type: Boolean,
      default: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one settings document exists
settingsSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.models.Settings.countDocuments();
    if (count > 0) {
      throw new Error('Settings document already exists. Use update instead.');
    }
  }
  next();
});

// Static method to get or create settings
settingsSchema.statics.getSettings = async function () {
  let settings = await this.findOne();
  if (!settings) {
    // Create default settings with some predefined categories and units
    settings = await this.create({
      categories: [
        { value: 'electronics', label: 'Electronics' },
        { value: 'furniture', label: 'Furniture' },
        { value: 'office-supplies', label: 'Office Supplies' },
        { value: 'raw-materials', label: 'Raw Materials' },
        { value: 'finished-goods', label: 'Finished Goods' },
        { value: 'packaging', label: 'Packaging' },
        { value: 'other', label: 'Other' },
      ],
      units: [
        { value: 'pcs', label: 'Pieces' },
        { value: 'kg', label: 'Kilograms' },
        { value: 'g', label: 'Grams' },
        { value: 'l', label: 'Liters' },
        { value: 'ml', label: 'Milliliters' },
        { value: 'boxes', label: 'Boxes' },
        { value: 'cartons', label: 'Cartons' },
        { value: 'pallets', label: 'Pallets' },
      ],
      singleton: true,
    });
  }
  return settings;
};

// Method to generate next SKU
settingsSchema.methods.generateSKU = async function () {
  const config = this.skuConfig;
  const now = new Date();

  // Increment the number
  this.skuConfig.lastNumber += 1;
  const number = String(this.skuConfig.lastNumber).padStart(config.numberLength, '0');

  // Replace placeholders in format
  let sku = config.format
    .replace('{PREFIX}', config.prefix)
    .replace('{YEAR}', now.getFullYear())
    .replace('{MONTH}', String(now.getMonth() + 1).padStart(2, '0'))
    .replace('{DAY}', String(now.getDate()).padStart(2, '0'))
    .replace('{NUMBER}', number);

  // Save the updated number
  await this.save();

  return sku;
};

const Settings = mongoose.model('Settings', settingsSchema);

module.exports = Settings;
