'use strict';

/**
 * Route aggregator — mounts all API route modules
 */

const { Router } = require('express');
const router = Router();

router.use('/messages',  require('./messages'));
router.use('/verify',    require('./verify'));
router.use('/broadcast', require('./broadcast'));
router.use('/groups',    require('./groups'));
router.use('/webhooks',  require('./webhooks'));
router.use('/contacts',  require('./contacts'));
router.use('/instance',  require('./instance'));
router.use('/logs',      require('./logs'));
router.use('/admin',     require('./admin'));

// Status / health (health is public, rest require auth)
router.use('/', require('./status'));

module.exports = router;
