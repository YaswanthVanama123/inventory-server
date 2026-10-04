const express = require('express');
const router = express.Router();
const controller = require('../controllers/quickBooksSyncController');

router.use(express.text({ type: ['text/xml', 'application/xml', 'application/soap+xml'], limit: '5mb' }));

router.get('/', controller.handleSoap);
router.post('/', controller.handleSoap);

module.exports = router;
