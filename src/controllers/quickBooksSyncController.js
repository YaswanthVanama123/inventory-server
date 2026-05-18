const syncService = require('../services/quickBooksSync.service');
const qbwcService = require('../services/qbwc.service');

class QuickBooksSyncController {
  async getStats(req, res, next) {
    try {
      const stats = await syncService.getStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('[QBSync] getStats error:', error);
      next(error);
    }
  }

  async listQueue(req, res, next) {
    try {
      const { status, type, limit, page } = req.query;
      const result = await syncService.listQueue({
        status,
        type,
        limit: limit ? parseInt(limit) : 100,
        page: page ? parseInt(page) : 1
      });
      res.json({ success: true, data: result });
    } catch (error) {
      console.error('[QBSync] listQueue error:', error);
      next(error);
    }
  }

  async retry(req, res, next) {
    try {
      const doc = await syncService.retry(req.params.id);
      if (!doc) {
        return res.status(404).json({ success: false, message: 'Queue record not found' });
      }
      res.json({ success: true, data: doc });
    } catch (error) {
      console.error('[QBSync] retry error:', error);
      next(error);
    }
  }

  async triggerSnapshot(req, res, next) {
    try {
      const [snapshot, discrepancies] = await Promise.all([
        syncService.enqueueHourlySnapshot(),
        syncService.enqueueRecentDiscrepancies()
      ]);
      res.json({
        success: true,
        data: { snapshot, discrepancies }
      });
    } catch (error) {
      console.error('[QBSync] triggerSnapshot error:', error);
      next(error);
    }
  }

  // QBWC SOAP entry point (mounted as POST /qbwc and GET /qbwc?wsdl)
  async handleSoap(req, res, next) {
    try {
      if (req.method === 'GET' && (req.query.wsdl !== undefined || req.query.WSDL !== undefined)) {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const url = `${proto}://${host}${req.baseUrl}${req.path}`.replace(/\?.*$/, '');
        res.type('text/xml').send(qbwcService.getWSDL(url));
        return;
      }

      const body = typeof req.body === 'string' ? req.body : (req.body?.toString?.() || '');
      const soapAction = req.headers['soapaction'] || req.headers['SOAPAction'] || '';
      const xml = await qbwcService.handleSoapRequest(body, soapAction);
      res.type('text/xml').send(xml);
    } catch (error) {
      console.error('[QBWC] SOAP handler error:', error);
      res.status(500).type('text/xml').send(`<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>${error.message}</faultstring></soap:Fault></soap:Body>
</soap:Envelope>`);
    }
  }
}

module.exports = new QuickBooksSyncController();
