const PurchaseOrder = require('../models/PurchaseOrder');

class OrderNumberGenerator {
  async generateManualOrderNumber(maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const lastManualOrder = await PurchaseOrder.findOne({
          source: 'manual',
          orderNumber: /^MAN-\d{7}$/
        })
          .sort({ orderNumber: -1 })
          .select('orderNumber')
          .lean();

        let nextNumber = 1;

        if (lastManualOrder && lastManualOrder.orderNumber) {
          const lastNumber = parseInt(lastManualOrder.orderNumber.replace('MAN-', ''));
          nextNumber = lastNumber + 1;
        }

        const orderNumber = `MAN-${nextNumber.toString().padStart(7, '0')}`;

        const existing = await PurchaseOrder.findOne({
          source: 'manual',
          orderNumber
        });

        if (!existing) {
          return orderNumber;
        }

        console.warn(`Order number ${orderNumber} already exists, retrying... (attempt ${attempt + 1}/${maxRetries})`);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(`Failed to generate order number after ${maxRetries} attempts: ${error.message}`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new Error('Failed to generate unique order number after maximum retries');
  }

  isValidManualOrderNumber(orderNumber) {
    return /^MAN-\d{7}$/.test(orderNumber);
  }
}

module.exports = new OrderNumberGenerator();
