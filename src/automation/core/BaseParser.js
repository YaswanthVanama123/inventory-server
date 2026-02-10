const logger = require('../utils/logger');

/**
 * BaseParser - Common data extraction patterns
 * Provides reusable parsing methods for all automations
 */
class BaseParser {
  /**
   * Parse table data
   * @param {Page} page - Playwright page object
   * @param {Object} selectors - { table, headers, rows, cells }
   */
  static async parseTable(page, selectors) {
    try {
      logger.debug('Parsing table', { selectors });

      // Wait for table to be visible
      await page.waitForSelector(selectors.table);

      // Extract table data
      const data = await page.evaluate((sel) => {
        const table = document.querySelector(sel.table);
        if (!table) return [];

        const rows = Array.from(table.querySelectorAll(sel.rows));
        
        return rows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          return cells.map(cell => cell.textContent.trim());
        });
      }, selectors);

      logger.debug('Table parsed', { rowCount: data.length });
      return data;
    } catch (error) {
      logger.error('Table parsing failed', { error: error.message });
      return [];
    }
  }

  /**
   * Parse table with headers
   * @param {Page} page - Playwright page object
   * @param {Object} selectors - Selectors object
   */
  static async parseTableWithHeaders(page, selectors) {
    try {
      const tableData = await page.evaluate((sel) => {
        const table = document.querySelector(sel.table);
        if (!table) return { headers: [], rows: [] };

        // Get headers
        const headerCells = Array.from(table.querySelectorAll('thead th, thead td'));
        const headers = headerCells.map(cell => cell.textContent.trim());

        // Get rows
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const rows = bodyRows.map(row => {
          const cells = Array.from(row.querySelectorAll('td'));
          const rowData = {};
          
          cells.forEach((cell, index) => {
            const header = headers[index] || `column${index}`;
            rowData[header] = cell.textContent.trim();
          });

          return rowData;
        });

        return { headers, rows };
      }, selectors);

      logger.debug('Table with headers parsed', { 
        headerCount: tableData.headers.length,
        rowCount: tableData.rows.length 
      });

      return tableData.rows;
    } catch (error) {
      logger.error('Table with headers parsing failed', { error: error.message });
      return [];
    }
  }

  /**
   * Parse list items
   * @param {Page} page - Playwright page object
   * @param {string} selector - CSS selector for list items
   */
  static async parseList(page, selector) {
    try {
      const items = await page.$$eval(selector, elements => 
        elements.map(el => el.textContent.trim())
      );

      logger.debug('List parsed', { itemCount: items.length });
      return items;
    } catch (error) {
      logger.error('List parsing failed', { error: error.message });
      return [];
    }
  }

  /**
   * Parse form data
   * @param {Page} page - Playwright page object
   * @param {string} formSelector - CSS selector for form
   */
  static async parseForm(page, formSelector) {
    try {
      const formData = await page.evaluate((sel) => {
        const form = document.querySelector(sel);
        if (!form) return {};

        const data = {};
        const inputs = form.querySelectorAll('input, select, textarea');

        inputs.forEach(input => {
          const name = input.name || input.id;
          if (name) {
            if (input.type === 'checkbox' || input.type === 'radio') {
              data[name] = input.checked;
            } else {
              data[name] = input.value;
            }
          }
        });

        return data;
      }, formSelector);

      logger.debug('Form parsed', { fieldCount: Object.keys(formData).length });
      return formData;
    } catch (error) {
      logger.error('Form parsing failed', { error: error.message });
      return {};
    }
  }

  /**
   * Clean text (remove extra whitespace, newlines, etc.)
   * @param {string} text - Text to clean
   */
  static cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Parse currency string to number
   * @param {string} currencyStr - Currency string (e.g., "$1,234.56")
   */
  static parseCurrency(currencyStr) {
    if (!currencyStr) return 0;
    const cleaned = currencyStr.replace(/[^0-9.-]/g, '');
    return parseFloat(cleaned) || 0;
  }

  /**
   * Parse date string
   * @param {string} dateStr - Date string
   */
  static parseDate(dateStr) {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    } catch (error) {
      return null;
    }
  }

  /**
   * Extract attribute from elements
   * @param {Page} page - Playwright page object
   * @param {string} selector - CSS selector
   * @param {string} attribute - Attribute name
   */
  static async extractAttribute(page, selector, attribute) {
    try {
      const values = await page.$$eval(
        selector,
        (elements, attr) => elements.map(el => el.getAttribute(attr)),
        attribute
      );

      return values.filter(v => v !== null);
    } catch (error) {
      logger.error('Attribute extraction failed', { error: error.message });
      return [];
    }
  }
}

module.exports = BaseParser;
