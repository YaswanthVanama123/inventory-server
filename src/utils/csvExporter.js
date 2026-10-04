
class CSVExporter {
  static toCSV(data, columns) {
    if (!data || data.length === 0) {
      return '';
    }

    const headers = columns.map(col => this.escapeCSVValue(col.label));
    const headerRow = headers.join(',');

    const dataRows = data.map(row => {
      const values = columns.map(col => {
        const value = row[col.key];
        return this.escapeCSVValue(value);
      });
      return values.join(',');
    });

    return [headerRow, ...dataRows].join('\n');
  }

  static escapeCSVValue(value) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

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
