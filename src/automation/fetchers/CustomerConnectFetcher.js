const CustomerConnectParser = require('../parsers/customerconnect.parser');





class CustomerConnectFetcher {
  constructor(page, navigator, selectors) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
  }

  


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
      
      let contentReady = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.page.waitForSelector('#content', {
            timeout: 15000,
            state: 'visible'
          });
          contentReady = true;
          break;
        } catch (e) {
          console.log(`  ⚠️  Attempt ${attempt}/3: Content not ready, waiting...`);
          if (attempt < 3) {
            await this.page.waitForTimeout(3000);
          }
        }
      }

      if (!contentReady) {
        console.log(`  ✗ Content failed to load after 3 attempts, stopping pagination`);
        break;
      }

      await this.page.waitForTimeout(1000);

      const orderDivs = await this.page.$$(this.selectors.ordersList.orderRows);

      if (process.env.DEBUG_SCRAPER === 'true') {
        console.log(`\n🔍 Found ${orderDivs.length} order divs using selector: ${this.selectors.ordersList.orderRows}`);
      }

      
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

  


  async extractOrderData(orderDiv) {
    try {
      
      const fullText = await orderDiv.textContent();

      
      let orderNumber = null;

      
      let orderIdMatch = fullText.match(/Order ID:\s*#?(\d+)/i);
      if (orderIdMatch) {
        orderNumber = orderIdMatch[1];
      }

      
      if (!orderNumber) {
        orderIdMatch = fullText.match(/^\s*(\d{5,})/);
        if (orderIdMatch) orderNumber = orderIdMatch[1];
      }

      if (!orderNumber) {
        console.warn('⊗ No order number found');
        return null;
      }

      
      const statusMatch = fullText.match(/Status:\s*([^\n]+)/i);
      const orderStatus = statusMatch ? statusMatch[1].trim() : null;

      
      const dateMatch = fullText.match(/Date\s*(?:Added)?:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      const orderDate = dateMatch ? dateMatch[1] : null;

      
      const totalMatch = fullText.match(/Total:\s*\$\s*([\d,]+\.?\d*)/i);
      const orderTotal = totalMatch ? totalMatch[1].replace(/,/g, '') : null;

      
      const vendorMatch = fullText.match(/Vendor\(s\):\s*([^,\n]+)/i);
      const vendorName = vendorMatch ? vendorMatch[1].trim() : null;

      
      const poMatch = fullText.match(/PO\s*Number\(s\):\s*([^,\n]+)/i);
      const poNumber = poMatch ? poMatch[1].trim() : null;

      
      if (process.env.DEBUG_SCRAPER === 'true') {
        console.log(`\n📋 Extracted Order #${orderNumber}:`);
        console.log(`   Status: ${orderStatus || 'NULL'}`);
        console.log(`   Date: ${orderDate || 'NULL'}`);
        console.log(`   Total: ${orderTotal || 'NULL'}`);
        console.log(`   Vendor: ${vendorName || 'NULL'}`);
        console.log(`   PO: ${poNumber || 'NULL'}`);
      }

      
      let orderLink = null;
      const allLinks = await orderDiv.$$('a');
      for (const link of allLinks) {
        const href = await link.getAttribute('href');
        if (href && (href.includes('order/info') || href.includes('order_id'))) {
          orderLink = href;
          break;
        }
      }

      
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
