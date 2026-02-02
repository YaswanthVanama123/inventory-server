module.exports = {
  secret: process.env.JWT_SECRET,
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  issuer: 'inventory-system',
  audience: 'inventory-users'
};
