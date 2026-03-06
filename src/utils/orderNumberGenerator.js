const PurchaseOrder = require('../models/PurchaseOrder');

/**
 * Generates a unique manual order number in the format: MAN-0000001
 * Handles race conditions with retry logic
 */
class OrderNumberGenerator {
  /**
   * Generate the next available manual order number
   * @param {number} maxRetries - Maximum number of retries for race condition handling
   * @returns {Promise<string>} - The generated order number
   */
  async generateManualOrderNumber(maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Find the highest manual order number
        const lastManualOrder = await PurchaseOrder.findOne({
          source: 'manual',
          orderNumber: /^MAN-\d{7}$/
        })
          .sort({ orderNumber: -1 })
          .select('orderNumber')
          .lean();

        let nextNumber = 1;

        if (lastManualOrder && lastManualOrder.orderNumber) {
          // Extract the numeric part and increment
          const lastNumber = parseInt(lastManualOrder.orderNumber.replace('MAN-', ''));
          nextNumber = lastNumber + 1;
        }

        // Format as MAN-0000001 (7 digits with leading zeros)
        const orderNumber = `MAN-${nextNumber.toString().padStart(7, '0')}`;

        // Verify this number doesn't exist (race condition check)
        const existing = await PurchaseOrder.findOne({
          source: 'manual',
          orderNumber
        });

        if (!existing) {
          return orderNumber;
        }

        // If exists, retry (race condition occurred)
        console.warn(`Order number ${orderNumber} already exists, retrying... (attempt ${attempt + 1}/${maxRetries})`);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(`Failed to generate order number after ${maxRetries} attempts: ${error.message}`);
        }
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw new Error('Failed to generate unique order number after maximum retries');
  }

  /**
   * Validate if an order number is a valid manual order number format
   * @param {string} orderNumber
   * @returns {boolean}
   */
  isValidManualOrderNumber(orderNumber) {
    return /^MAN-\d{7}$/.test(orderNumber);
  }
}

module.exports = new OrderNumberGenerator();
