const Product = require('../models/Product');

/**
 * SKU Mapper Service
 * Resolves portal item names to internal SKUs using product aliases
 */
class SKUMapper {
  /**
   * Find product by SKU or alias
   * @param {string} searchTerm - SKU or product name/alias
   * @returns {Promise<Product|null>}
   */
  static async findProduct(searchTerm) {
    if (!searchTerm) return null;

    const normalizedSearch = searchTerm.toLowerCase().trim();

    // Try exact SKU match first
    let product = await Product.findOne({
      sku: normalizedSearch.toUpperCase(),
      isActive: true
    });

    if (product) return product;

    // Try alias match
    product = await Product.findOne({
      aliases: normalizedSearch,
      isActive: true
    });

    if (product) return product;

    // Try fuzzy name match
    product = await Product.findOne({
      name: { $regex: normalizedSearch, $options: 'i' },
      isActive: true
    });

    return product;
  }

  /**
   * Map external item to internal SKU
   * @param {Object} externalItem - Item from external portal
   * @param {string} externalItem.name - Item name
   * @param {string} externalItem.sku - Item SKU (might be different from internal)
   * @param {string} source - Source portal ('customerconnect' or 'routestar')
   * @returns {Promise<Object>} - { sku, product, isNew }
   */
  static async mapItem(externalItem, source) {
    const { name, sku } = externalItem;

    // Try to find by external SKU first
    let product = await this.findProduct(sku);

    // If not found, try by name
    if (!product && name) {
      product = await this.findProduct(name);
    }

    if (product) {
      // Add the external name as alias if not already present
      if (name && !product.aliases.includes(name.toLowerCase())) {
        product.addAlias(name);
        await product.save();
      }

      return {
        sku: product.sku,
        product,
        isNew: false
      };
    }

    // Product not found - return unmapped item
    return {
      sku: sku || this.generateTempSKU(name),
      product: null,
      isNew: true,
      needsMapping: true,
      externalName: name,
      externalSKU: sku,
      source
    };
  }

  /**
   * Map multiple items at once
   * @param {Array} items - Array of external items
   * @param {string} source - Source portal
   * @returns {Promise<Array>} - Mapped items with SKU info
   */
  static async mapItems(items, source) {
    const mappedItems = [];
    const unmappedItems = [];

    for (const item of items) {
      const mapped = await this.mapItem(item, source);

      if (mapped.needsMapping) {
        unmappedItems.push(mapped);
      }

      mappedItems.push(mapped);
    }

    if (unmappedItems.length > 0) {
      console.warn(`${unmappedItems.length} items need manual SKU mapping:`, unmappedItems);
    }

    return mappedItems;
  }

  /**
   * Create or update product from external data
   * @param {Object} externalItem - Item from external portal
   * @param {string} source - Source portal
   * @param {Object} userId - User ID for tracking
   * @returns {Promise<Product>}
   */
  static async createOrUpdateProduct(externalItem, source, userId = null) {
    const { name, sku, unitPrice } = externalItem;

    // Try to find existing product
    let product = await this.findProduct(sku || name);

    if (product) {
      // Update existing product
      if (source === 'customerconnect' && unitPrice) {
        product.lastPurchasePrice = unitPrice;
      } else if (source === 'routestar' && unitPrice) {
        product.lastSalePrice = unitPrice;
      }

      if (name && !product.aliases.includes(name.toLowerCase())) {
        product.addAlias(name);
      }

      product.lastUpdatedBy = userId;
      await product.save();

      return product;
    }

    // Create new product
    const newSKU = sku || this.generateTempSKU(name);

    product = await Product.create({
      sku: newSKU,
      name: name || 'Unknown Product',
      aliases: name ? [name.toLowerCase()] : [],
      lastPurchasePrice: source === 'customerconnect' ? unitPrice : 0,
      lastSalePrice: source === 'routestar' ? unitPrice : 0,
      unit: 'pcs',
      category: 'Uncategorized',
      createdBy: userId,
      lastUpdatedBy: userId
    });

    console.log(`Created new product: ${newSKU} - ${name}`);

    return product;
  }

  /**
   * Generate temporary SKU for unmapped items
   * @param {string} name - Item name
   * @returns {string} - Generated SKU
   */
  static generateTempSKU(name) {
    const prefix = 'TEMP';
    const timestamp = Date.now().toString(36).toUpperCase();
    const namePart = name
      ? name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')
      : 'XXX';

    return `${prefix}-${namePart}-${timestamp}`;
  }

  /**
   * Get unmapped items that need manual SKU assignment
   * @returns {Promise<Array>}
   */
  static async getUnmappedItems() {
    return Product.find({
      sku: { $regex: /^TEMP-/ },
      isActive: true
    }).sort({ createdAt: -1 });
  }

  /**
   * Manually map an unmapped item to a real SKU
   * @param {string} tempSKU - Temporary SKU
   * @param {string} realSKU - Real SKU to map to
   * @param {Object} userId - User ID
   * @returns {Promise<Product>}
   */
  static async manuallyMapSKU(tempSKU, realSKU, userId = null) {
    const tempProduct = await Product.findOne({ sku: tempSKU });

    if (!tempProduct) {
      throw new Error(`Temporary product ${tempSKU} not found`);
    }

    // Check if real SKU already exists
    const existingProduct = await Product.findOne({ sku: realSKU });

    if (existingProduct) {
      // Merge temp product aliases into existing product
      tempProduct.aliases.forEach(alias => {
        if (!existingProduct.aliases.includes(alias)) {
          existingProduct.addAlias(alias);
        }
      });

      existingProduct.lastUpdatedBy = userId;
      await existingProduct.save();

      // Delete temp product
      tempProduct.isActive = false;
      tempProduct.lastUpdatedBy = userId;
      await tempProduct.save();

      return existingProduct;
    }

    // Update temp product with real SKU
    tempProduct.sku = realSKU;
    tempProduct.lastUpdatedBy = userId;
    await tempProduct.save();

    return tempProduct;
  }
}

module.exports = SKUMapper;
