/**
 * CSV Exporter Utility
 * Converts data to CSV format
 */

class CSVExporter {
  /**
   * Convert array of objects to CSV string
   * @param {Array} data - Array of objects to convert
   * @param {Array} columns - Array of column definitions { key, label }
   * @returns {string} CSV string
   */
  static toCSV(data, columns) {
    if (!data || data.length === 0) {
      return '';
    }

    // Create header row
    const headers = columns.map(col => this.escapeCSVValue(col.label));
    const headerRow = headers.join(',');

    // Create data rows
    const dataRows = data.map(row => {
      const values = columns.map(col => {
        const value = row[col.key];
        return this.escapeCSVValue(value);
      });
      return values.join(',');
    });

    // Combine header and data rows
    return [headerRow, ...dataRows].join('\n');
  }

  /**
   * Escape CSV value (handle commas, quotes, newlines)
   * @param {*} value - Value to escape
   * @returns {string} Escaped value
   */
  static escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If value contains comma, quote, or newline, wrap in quotes and escape existing quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Create CSV download response
   * @param {Object} res - Express response object
   * @param {Array} data - Data to export
   * @param {Array} columns - Column definitions
   * @param {string} filename - Filename (without .csv extension)
   */
  static sendCSVResponse(res, data, columns, filename) {
    const csv = this.toCSV(data, columns);
    const timestamp = new Date().toISOString().split('T')[0];
    const fullFilename = `${filename}_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fullFilename}"`);
    res.send(csv);
  }
}

module.exports = CSVExporter;
