const Product = require('../models/Product');





class SKUMapper {
  




  static async findProduct(searchTerm) {
    if (!searchTerm) return null;

    const normalizedSearch = searchTerm.toLowerCase().trim();

    
    let product = await Product.findOne({
      sku: normalizedSearch.toUpperCase(),
      isActive: true
    });

    if (product) return product;

    
    product = await Product.findOne({
      aliases: normalizedSearch,
      isActive: true
    });

    if (product) return product;

    
    product = await Product.findOne({
      name: { $regex: normalizedSearch, $options: 'i' },
      isActive: true
    });

    return product;
  }

  







  static async mapItem(externalItem, source) {
    const { name, sku } = externalItem;

    
    let product = await this.findProduct(sku);

    
    if (!product && name) {
      product = await this.findProduct(name);
    }

    if (product) {
      
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

  






  static async createOrUpdateProduct(externalItem, source, userId = null) {
    const { name, sku, unitPrice } = externalItem;

    
    let product = await this.findProduct(sku || name);

    if (product) {
      
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

  




  static generateTempSKU(name) {
    const prefix = 'TEMP';
    const timestamp = Date.now().toString(36).toUpperCase();
    const namePart = name
      ? name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '')
      : 'XXX';

    return `${prefix}-${namePart}-${timestamp}`;
  }

  



  static async getUnmappedItems() {
    return Product.find({
      sku: { $regex: /^TEMP-/ },
      isActive: true
    }).sort({ createdAt: -1 });
  }

  






  static async manuallyMapSKU(tempSKU, realSKU, userId = null) {
    const tempProduct = await Product.findOne({ sku: tempSKU });

    if (!tempProduct) {
      throw new Error(`Temporary product ${tempSKU} not found`);
    }

    
    const existingProduct = await Product.findOne({ sku: realSKU });

    if (existingProduct) {
      
      tempProduct.aliases.forEach(alias => {
        if (!existingProduct.aliases.includes(alias)) {
          existingProduct.addAlias(alias);
        }
      });

      existingProduct.lastUpdatedBy = userId;
      await existingProduct.save();

      
      tempProduct.isActive = false;
      tempProduct.lastUpdatedBy = userId;
      await tempProduct.save();

      return existingProduct;
    }

    
    tempProduct.sku = realSKU;
    tempProduct.lastUpdatedBy = userId;
    await tempProduct.save();

    return tempProduct;
  }
}

module.exports = SKUMapper;
