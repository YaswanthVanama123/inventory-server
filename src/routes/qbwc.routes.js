const express = require('express');
const router = express.Router();
const controller = require('../controllers/quickBooksSyncController');

// QBWC needs raw XML body, not JSON
router.use(express.text({ type: ['text/xml', 'application/xml', 'application/soap+xml'], limit: '5mb' }));

// WSDL discovery via GET ?wsdl, SOAP calls via POST
router.get('/', controller.handleSoap);
router.post('/', controller.handleSoap);

module.exports = router;
