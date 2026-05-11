'use strict';

/**
 * Route aggregator — mounts all API route modules
 */

const { Router } = require('express');

const router = Router();

router.use('/messages', require('./messages'));
router.use('/verify', require('./verify'));
router.use('/broadcast', require('./broadcast'));
router.use('/groups', require('./groups'));
router.use('/webhooks', require('./webhooks'));
router.use('/admin', require('./admin'));

// Status routes (mounted separately — /health is public)
const statusRouter = require('./status');
router.use('/', statusRouter);

module.exports = router;
