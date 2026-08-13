'use strict';

module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(200).json({
    ok: true,
    service: 'karkalkan-v4',
    mode: 'read-only-foundation'
  });
};
