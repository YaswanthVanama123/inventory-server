/**
 * Fetcher for RouteStar Items
 * Handles fetching items from the items list
 */
class RouteStarItemsFetcher {
  constructor(page, navigator, selectors, baseUrl) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch all items
   */
  async fetchItems(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Items ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToItems();

    // NOTE: The "All" items option doesn't work reliably on this site - it only shows 22 items
    // even when there are 224+ items total. We must use pagination instead.
    // Keeping the setItemsPerPageToAll method for future reference but not using it.

    return await this.fetchItemsList(limit, this.selectors.itemsList);
  }

  /**
   * Generic items list fetcher
   */
  async fetchItemsList(limit, selectors) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    const items = [];
    const seenItemNames = new Set();  // Track items we've already seen
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = fetchAll ? Infinity : Math.ceil(limit / 20); // Items show 20 per page by default

    console.log(`📊 Pagination settings:`);
    console.log(`   - Fetch all: ${fetchAll}`);
    console.log(`   - Limit: ${limit === Infinity ? 'Infinity' : limit}`);
    console.log(`   - Max pages: ${maxPages === Infinity ? 'Infinity' : maxPages}`);

    while (hasNextPage && pageCount < maxPages) {
      console.log(`\n📄 Processing page ${pageCount + 1}...`);

      // Track items count before this page
      const itemsBeforePage = items.length;

      // Wait for item rows with lenient strategy
      try {
        await this.page.waitForSelector(selectors.itemRows, {
          timeout: 30000,  // 30 seconds
          state: 'attached'  // More lenient than 'visible'
        });
        console.log('✓ Item rows found in DOM');
      } catch (error) {
        console.log('⚠️  Item rows selector timeout - trying to proceed anyway');
        // Don't throw - table might still be loading dynamically
      }

      await this.page.waitForTimeout(3000);

      // Check for master table
      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        console.log('⚠️  No master table found - likely no items on this page');
        // Check if this is page 1 (no items at all) or just end of pagination
        if (pageCount === 0) {
          console.log('✓ No items found (table doesn\'t exist) - this is normal if there are 0 items');
          break; // Exit loop gracefully
        } else {
          console.log('✓ Reached end of pagination (no more pages)');
          break; // Exit loop gracefully
        }
      }
      console.log('✓ Found master table');

      const itemRows = await masterTable.$$('table.htCore tbody tr');
      console.log(`   Found ${itemRows.length} rows in table`);

      // If 0 rows, check if we should continue
      if (itemRows.length === 0) {
        console.log('⚠️  Table exists but has 0 rows - no items on this page');
        if (pageCount === 0) {
          console.log('✓ No items found (empty table) - this is normal if there are 0 items');
        }
        break; // Exit loop gracefully
      }

      for (let i = 0; i < itemRows.length; i++) {
        const row = itemRows[i];
        if (!fetchAll && items.length >= limit) {
          console.log(`   Reached limit of ${limit} items, stopping`);
          break;
        }

        try {
          const itemData = await this.extractItemData(row, selectors);
          if (itemData) {
            // Check for duplicates
            if (seenItemNames.has(itemData.itemName)) {
              console.log(`  ⊘ Row ${i + 1}: Duplicate item "${itemData.itemName}" (already collected)`);
              continue;
            }

            console.log(`  ✓ Row ${i + 1}: Item "${itemData.itemName}"`);
            items.push(itemData);
            seenItemNames.add(itemData.itemName);
          } else {
            console.log(`  ⊘ Row ${i + 1}: Skipped (no item name or empty row)`);
          }
        } catch (error) {
          console.log(`  ✗ Row ${i + 1}: Error - ${error.message}`);
        }
      }

      console.log(`   Page ${pageCount + 1} complete: ${items.length} total items collected so far`);

      // Check if we got any new items on this page
      const newItemsOnPage = items.length - itemsBeforePage;
      if (itemRows.length > 0 && newItemsOnPage === 0) {
        console.log(`   ⚠️  All items on this page were duplicates - pagination may be stuck`);
        console.log(`   ✓ Stopping pagination to prevent infinite loop`);
        break;
      }

      if (fetchAll || items.length < limit) {
        console.log('   Checking for next page...');
        hasNextPage = await this.navigator.goToNextPage();
        if (hasNextPage) {
          pageCount++;
          console.log(`   ✓ Moving to page ${pageCount + 1}`);
        } else {
          console.log(`   ✓ No more pages - completed after ${pageCount + 1} page(s)`);
        }
      } else {
        hasNextPage = false;
        console.log('   ✓ Reached desired limit, stopping pagination');
      }
    }

    console.log(`\n✅ Pagination complete:`);
    console.log(`   - Total pages processed: ${pageCount + 1}`);
    console.log(`   - Total items fetched: ${items.length}`);

    if (items.length === 0) {
      console.log(`   ℹ️  Note: 0 items found - this is normal if there are no items currently`);
    }

    return items;
  }

  /**
   * Extract item data from row
   */
  async extractItemData(row, selectors) {
    try {
      // Extract item name (required field)
      let itemName = null;
      try {
        itemName = await row.$eval(
          selectors.itemName,
          el => el.textContent.trim()
        );
      } catch (err) {
        // Try fallback selector
        try {
          itemName = await row.$eval(
            'td:nth-of-type(2)',
            el => el.textContent.trim()
          );
        } catch (err2) {
          // Could not extract item name
        }
      }

      // If no item name, skip this row
      if (!itemName) {
        return null;
      }

      // Extract item link
      const itemLink = await row.$eval(
        selectors.itemNameLink,
        el => el.getAttribute('href')
      ).catch(() => null);

      // Extract item parent
      const itemParent = await row.$eval(
        selectors.itemParent,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract description
      const description = await row.$eval(
        selectors.description,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract purchase cost
      const purchaseCost = await row.$eval(
        selectors.purchaseCost,
        el => el.textContent.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      // Extract sales price
      const salesPrice = await row.$eval(
        selectors.salesPrice,
        el => el.textContent.replace(/[$,]/g, '').trim()
      ).catch(() => '0.00');

      // Extract type
      const type = await row.$eval(
        selectors.type,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract quantity on order
      const qtyOnOrder = await row.$eval(
        selectors.qtyOnOrder,
        el => el.textContent.trim()
      ).catch(() => '0');

      // Extract quantity on hand
      const qtyOnHand = await row.$eval(
        selectors.qtyOnHand,
        el => el.textContent.trim()
      ).catch(() => '0');

      // Extract quantity on warehouse
      const qtyOnWarehouse = await row.$eval(
        selectors.qtyOnWarehouse,
        el => {
          const link = el.querySelector('a');
          return link ? link.textContent.trim() : el.textContent.trim();
        }
      ).catch(() => '0');

      // Extract warehouse link
      const warehouseLink = await row.$eval(
        selectors.qtyOnWarehouseLink,
        el => el.getAttribute('href')
      ).catch(() => null);

      // Extract MFG Part Number
      const mfgPartNumber = await row.$eval(
        selectors.mfgPartNumber,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract UOM (Unit of Measure)
      const uom = await row.$eval(
        selectors.uom,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract category
      const category = await row.$eval(
        selectors.category,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract department
      const department = await row.$eval(
        selectors.department,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract allocated quantity
      const allocated = await row.$eval(
        selectors.allocated,
        el => el.textContent.trim()
      ).catch(() => '0');

      // Extract grouping
      const grouping = await row.$eval(
        selectors.grouping,
        el => el.textContent.trim()
      ).catch(() => null);

      // Extract tax code
      const taxCode = await row.$eval(
        selectors.taxCode,
        el => el.textContent.trim()
      ).catch(() => null);

      return {
        itemName,
        itemParent,
        description,
        purchaseCost: parseFloat(purchaseCost) || 0,
        salesPrice: parseFloat(salesPrice) || 0,
        type,
        qtyOnOrder: parseInt(qtyOnOrder) || 0,
        qtyOnHand: parseInt(qtyOnHand) || 0,
        qtyOnWarehouse: parseInt(qtyOnWarehouse) || 0,
        mfgPartNumber,
        uom,
        category,
        department,
        allocated: parseInt(allocated) || 0,
        grouping,
        taxCode,
        itemDetailUrl: itemLink ? new URL(itemLink, this.baseUrl).href : null,
        warehouseDetailUrl: warehouseLink ? new URL(warehouseLink, this.baseUrl).href : null
      };
    } catch (error) {
      console.log(`    Error extracting row data: ${error.message}`);
      return null;
    }
  }
}

module.exports = RouteStarItemsFetcher;
