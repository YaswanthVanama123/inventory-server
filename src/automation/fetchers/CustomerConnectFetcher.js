const CustomerConnectParser = require('../parsers/customerconnect.parser');

/**
 * Fetcher for CustomerConnect Orders
 * Handles fetching orders and order details
 */
class CustomerConnectFetcher {
  constructor(page, navigator, selectors) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
  }

  /**
   * Fetch list of orders
   */
  async fetchOrders(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching CustomerConnect Orders ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToOrders();

    const paginationInfo = await this.navigator.getPaginationInfo();
    console.log(`   Total Available: ${paginationInfo.totalOrders} orders`);

    const orders = [];
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = fetchAll ? Infinity : Math.ceil(limit / 10);
    let firstOrderLogged = false;

    while (hasNextPage && pageCount < maxPages) {
      await this.page.waitForSelector('#content', {
        timeout: 10000,
        state: 'visible'
      });
      await this.page.waitForTimeout(1000);

      const orderDivs = await this.page.$$(this.selectors.ordersList.orderRows);

      if (process.env.DEBUG_SCRAPER === 'true') {
        console.log(`\n🔍 Found ${orderDivs.length} order divs using selector: ${this.selectors.ordersList.orderRows}`);
      }

      // Log first order's HTML structure for debugging
      if (!firstOrderLogged && orderDivs.length > 0 && process.env.DEBUG_SCRAPER === 'true') {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 FIRST ORDER HTML STRUCTURE (for debugging):');
        console.log('='.repeat(80));
        const firstOrderHtml = await orderDivs[0].innerHTML();
        console.log(firstOrderHtml);
        console.log('='.repeat(80) + '\n');
        firstOrderLogged = true;
      }

      for (const orderDiv of orderDivs) {
        if (!fetchAll && orders.length >= limit) {
          console.log(`  ⊗ Limit reached (${limit}), stopping...`);
          break;
        }

        try {
          const orderData = await this.extractOrderData(orderDiv);
          if (orderData) {
            orders.push(orderData);
            console.log(`  ✓ Extracted: #${orderData.orderNumber}`);
          }
        } catch (error) {
          console.warn(`  ⊗ Skipped order: ${error.message}`);
        }
      }

      if (!fetchAll && orders.length >= limit) {
        console.log(`  → Limit reached, stopping pagination`);
        hasNextPage = false;
      } else if (fetchAll || orders.length < limit) {
        hasNextPage = await this.navigator.goToNextPage();
        if (hasNextPage) pageCount++;
      } else {
        hasNextPage = false;
      }
    }

    console.log(`   ✓ Fetched: ${orders.length} orders\n`);

    return {
      orders,
      pagination: {
        totalOrders: paginationInfo.totalOrders,
        totalPages: paginationInfo.totalPages,
        fetchedOrders: orders.length,
        fetchedPages: pageCount,
        remainingOrders: paginationInfo.totalOrders - orders.length,
        remainingPages: paginationInfo.totalPages - pageCount
      }
    };
  }

  /**
   * Extract order data from order div
   */
  async extractOrderData(orderDiv) {
    try {
      // Get full text content for extraction
      const fullText = await orderDiv.textContent();

      // Extract Order Number - try multiple patterns
      let orderNumber = null;

      // Pattern 1: "Order ID: #75938" or just "#75938"
      let orderIdMatch = fullText.match(/Order ID:\s*#?(\d+)/i);
      if (orderIdMatch) {
        orderNumber = orderIdMatch[1];
      }

      // Pattern 2: First standalone number at the beginning
      if (!orderNumber) {
        orderIdMatch = fullText.match(/^\s*(\d{5,})/);
        if (orderIdMatch) orderNumber = orderIdMatch[1];
      }

      if (!orderNumber) {
        console.warn('⊗ No order number found');
        return null;
      }

      // Extract Status
      const statusMatch = fullText.match(/Status:\s*([^\n]+)/i);
      const orderStatus = statusMatch ? statusMatch[1].trim() : null;

      // Extract Date
      const dateMatch = fullText.match(/Date\s*(?:Added)?:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const orderDate = dateMatch ? dateMatch[1] : null;

      // Extract Total
      const totalMatch = fullText.match(/Total:\s*\$\s*([\d,]+\.?\d*)/i);
      const orderTotal = totalMatch ? totalMatch[1].replace(/,/g, '') : null;

      // Extract Vendor - FIX: capture everything after "Vendor(s):" until comma
      const vendorMatch = fullText.match(/Vendor\(s\):\s*([^,\n]+)/i);
      const vendorName = vendorMatch ? vendorMatch[1].trim() : null;

      // Extract PO Number
      const poMatch = fullText.match(/PO\s*Number\(s\):\s*([^,\n]+)/i);
      const poNumber = poMatch ? poMatch[1].trim() : null;

      // Debug logging
      if (process.env.DEBUG_SCRAPER === 'true') {
        console.log(`\n📋 Extracted Order #${orderNumber}:`);
        console.log(`   Status: ${orderStatus || 'NULL'}`);
        console.log(`   Date: ${orderDate || 'NULL'}`);
        console.log(`   Total: ${orderTotal || 'NULL'}`);
        console.log(`   Vendor: ${vendorName || 'NULL'}`);
        console.log(`   PO: ${poNumber || 'NULL'}`);
      }

      // Try to find the order detail link
      let orderLink = null;
      const allLinks = await orderDiv.$$('a');
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (href && (href.includes('order/info') || href.includes('order_id'))) {
          orderLink = href;
          break;
        }
      }

      // Construct URL from order number if no link found
      if (!orderLink && orderNumber) {
        orderLink = `https://envirostore.mycustomerconnect.com/index.php?route=account/order/info&order_id=${orderNumber}`;
      }

      return {
        orderNumber,
        status: orderStatus,
        orderDate,
        total: orderTotal,
        vendorName,
        poNumber,
        detailUrl: orderLink
      };
    } catch (error) {
      console.error('Error extracting order data:', error.message);
      return null;
    }
  }

  /**
   * Fetch order details
   */
  async fetchOrderDetails(orderUrl) {
    await this.navigator.navigateToOrderDetails(orderUrl);

    
    const orderDetailsText = await this.page.locator('table.list').first().locator('tbody tr td.left').first().textContent();

    const orderNumberMatch = orderDetailsText.match(/Order ID:\s*#?(\d+)/i);
    const orderNumber = orderNumberMatch ? orderNumberMatch[1] : '';

    const poNumberMatch = orderDetailsText.match(/PO #:\s*([^\n]+)/i);
    const poNumber = poNumberMatch ? poNumberMatch[1].trim() : '';

    const dateMatch = orderDetailsText.match(/Date Added:\s*(\d{2}\/\d{2}\/\d{4})/i);
    const orderDate = dateMatch ? dateMatch[1] : '';

    const statusMatch = orderDetailsText.match(/Status:\s*([^\n]+)/i);
    const status = statusMatch ? statusMatch[1].trim() : '';

    const vendorMatch = orderDetailsText.match(/Vendor:\s*([^\n]+)/i);
    const vendorName = vendorMatch ? vendorMatch[1].trim() : '';

    const totalMatch = orderDetailsText.match(/Total:\s*\$?([\d,]+\.?\d*)/i);
    const total = totalMatch ? totalMatch[1] : '';

    
    const items = await this.extractLineItems();

    return {
      orderNumber,
      poNumber,
      orderDate,
      status,
      vendorName,
      total,
      items
    };
  }

  /**
   * Extract line items from details page
   */
  async extractLineItems() {
    const items = [];

    try {
      const itemRows = await this.page.$$('table.list tbody tr');

      for (const row of itemRows) {
        try {
          const description = await row.$eval('td:nth-child(1)', el => el.textContent.trim()).catch(() => '');
          const model = await row.$eval('td:nth-child(2)', el => el.textContent.trim()).catch(() => '');
          const quantityText = await row.$eval('td:nth-child(3)', el => el.textContent.trim()).catch(() => '0');
          const priceText = await row.$eval('td:nth-child(4)', el => el.textContent.trim()).catch(() => '0');
          const totalText = await row.$eval('td:nth-child(5)', el => el.textContent.trim()).catch(() => '0');

          
          if (!description || description.toLowerCase().includes('product') ||
              !model || !quantityText) {
            continue;
          }

          items.push({
            description,
            model,
            sku: model, 
            quantity: parseFloat(quantityText.replace(/[^0-9.]/g, '')) || 0,
            unitPrice: parseFloat(priceText.replace(/[$,]/g, '')) || 0,
            total: parseFloat(totalText.replace(/[$,]/g, '')) || 0
          });
        } catch (error) {
          
        }
      }
    } catch (error) {
      console.error('Error extracting line items:', error.message);
    }

    return items;
  }
}

module.exports = CustomerConnectFetcher;
