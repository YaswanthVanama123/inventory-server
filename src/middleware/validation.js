const { body, param, query, validationResult } = require('express-validator');

// Middleware to parse JSON fields from FormData
const parseFormDataJSON = (req, res, next) => {
  // List of fields that should be parsed as JSON
  const jsonFields = ['tags', 'supplier', 'images'];

  if (req.body) {
    jsonFields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (err) {
          // If parsing fails, leave it as is
          console.log(`Failed to parse ${field} as JSON:`, err.message);
        }
      }
    });
  }

  next();
};

// Middleware to handle validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array().map(err => ({
          field: err.path || err.param,
          message: err.msg
        }))
      }
    });
  }
  next();
};

// User validation rules
const userValidation = {
  create: [
    body('username')
      .trim()
      .notEmpty().withMessage('Username is required')
      .isLength({ min: 3, max: 50 }).withMessage('Username must be between 3 and 50 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
      .trim()
      .notEmpty().withMessage('Email is required')
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('password')
      .notEmpty().withMessage('Password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain uppercase, lowercase, number, and special character'),
    body('fullName')
      .trim()
      .notEmpty().withMessage('Full name is required'),
    body('role')
      .optional()
      .isIn(['admin', 'employee']).withMessage('Role must be either admin or employee')
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('email')
      .optional()
      .trim()
      .isEmail().withMessage('Please provide a valid email')
      .normalizeEmail(),
    body('fullName')
      .optional()
      .trim()
      .notEmpty().withMessage('Full name cannot be empty'),
    body('role')
      .optional()
      .isIn(['admin', 'employee']).withMessage('Role must be either admin or employee'),
    body('isActive')
      .optional()
      .isBoolean().withMessage('isActive must be a boolean')
  ],
  resetPassword: [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain uppercase, lowercase, number, and special character')
  ]
};

// Auth validation rules
const authValidation = {
  login: [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  changePassword: [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
      .notEmpty().withMessage('New password is required')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).withMessage('Password must contain uppercase, lowercase, number, and special character')
  ]
};

// Inventory validation rules
const inventoryValidation = {
  create: [
    body('itemName').trim().notEmpty().withMessage('Item name is required').isLength({ max: 200 }).withMessage('Item name is too long'),
    body('skuCode').trim().notEmpty().withMessage('SKU code is required').toUpperCase(),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description is too long'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('quantity.current').optional(),
    body('currentQuantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
    body('quantity.minimum').optional(),
    body('minimumQuantity').optional().isFloat({ min: 0 }).withMessage('Minimum quantity must be non-negative'),
    body('quantity.unit').optional(),
    body('unit').optional().trim(),
    body('pricing.purchasePrice').optional(),
    body('purchasePrice').optional().isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
    body('pricing.sellingPrice').optional(),
    body('sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
    body('pricing.currency').optional().trim().toUpperCase(),
    body('supplier').optional(),
    body('supplierName').optional().trim(),
    body('supplier.name').optional().trim(),
    body('supplier.email').optional().trim().isEmail().withMessage('Invalid supplier email').normalizeEmail(),
    body('supplierEmail').optional().trim().isEmail().withMessage('Invalid supplier email').normalizeEmail(),
    body('supplier.leadTime').optional().isFloat({ min: 0 }).withMessage('Lead time must be non-negative'),
    body('leadTime').optional().isFloat({ min: 0 }).withMessage('Lead time must be non-negative'),
    body('supplier.reorderPoint').optional().isFloat({ min: 0 }).withMessage('Reorder point must be non-negative'),
    body('reorderPoint').optional().isFloat({ min: 0 }).withMessage('Reorder point must be non-negative'),
    body('supplier.minimumOrderQuantity').optional().isFloat({ min: 1 }).withMessage('Minimum order quantity must be at least 1'),
    body('minOrderQuantity').optional().isFloat({ min: 1 }).withMessage('Minimum order quantity must be at least 1')
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid inventory ID'),
    body('itemName').optional().trim().notEmpty().withMessage('Item name cannot be empty').isLength({ max: 200 }).withMessage('Item name is too long'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description is too long'),
    body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('quantity.current').optional().isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
    body('currentQuantity').optional().isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
    body('quantity.minimum').optional().isFloat({ min: 0 }).withMessage('Minimum quantity must be non-negative'),
    body('minimumQuantity').optional().isFloat({ min: 0 }).withMessage('Minimum quantity must be non-negative'),
    body('pricing.purchasePrice').optional().isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
    body('purchasePrice').optional().isFloat({ min: 0 }).withMessage('Purchase price must be non-negative'),
    body('pricing.sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
    body('sellingPrice').optional().isFloat({ min: 0 }).withMessage('Selling price must be non-negative'),
    body('supplier.email').optional().trim().isEmail().withMessage('Invalid supplier email').normalizeEmail(),
    body('supplierEmail').optional().trim().isEmail().withMessage('Invalid supplier email').normalizeEmail()
  ],
  updateStock: [
    param('id').isMongoId().withMessage('Invalid inventory ID'),
    body('quantity').notEmpty().withMessage('Quantity is required').isFloat().withMessage('Quantity must be a number'),
    body('action').notEmpty().withMessage('Action is required').isIn(['add', 'remove', 'set']).withMessage('Action must be add, remove, or set'),
    body('reason').optional().trim()
  ]
};

// Invoice validation rules
const invoiceValidation = {
  create: [
    body('invoiceNumber')
      .trim()
      .notEmpty().withMessage('Invoice number is required')
      .isLength({ max: 50 }).withMessage('Invoice number is too long'),
    body('customer.name')
      .trim()
      .notEmpty().withMessage('Customer name is required')
      .isLength({ max: 200 }).withMessage('Customer name is too long'),
    body('customer.email')
      .trim()
      .notEmpty().withMessage('Customer email is required')
      .isEmail().withMessage('Please provide a valid customer email')
      .normalizeEmail(),
    body('customer.phone')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
    body('customer.address')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Address is too long'),
    body('items')
      .isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.description')
      .trim()
      .notEmpty().withMessage('Item description is required')
      .isLength({ max: 500 }).withMessage('Item description is too long'),
    body('items.*.quantity')
      .notEmpty().withMessage('Item quantity is required')
      .isFloat({ min: 0.01 }).withMessage('Item quantity must be greater than 0'),
    body('items.*.unitPrice')
      .notEmpty().withMessage('Item unit price is required')
      .isFloat({ min: 0 }).withMessage('Item unit price must be non-negative'),
    body('items.*.taxRate')
      .optional()
      .isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100'),
    body('items.*.discount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Item discount must be non-negative'),
    body('amounts.subtotal')
      .notEmpty().withMessage('Subtotal is required')
      .isFloat({ min: 0 }).withMessage('Subtotal must be non-negative'),
    body('amounts.tax')
      .optional()
      .isFloat({ min: 0 }).withMessage('Tax must be non-negative'),
    body('amounts.discount')
      .optional()
      .isFloat({ min: 0 }).withMessage('Discount must be non-negative'),
    body('amounts.total')
      .notEmpty().withMessage('Total amount is required')
      .isFloat({ min: 0 }).withMessage('Total amount must be non-negative'),
    body('amounts.currency')
      .optional()
      .trim()
      .isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters')
      .toUpperCase(),
    body('status')
      .optional()
      .isIn(['draft', 'pending', 'paid', 'overdue', 'cancelled']).withMessage('Invalid status'),
    body('issueDate')
      .notEmpty().withMessage('Issue date is required')
      .isISO8601().withMessage('Invalid issue date format'),
    body('dueDate')
      .notEmpty().withMessage('Due date is required')
      .isISO8601().withMessage('Invalid due date format')
      .custom((value, { req }) => {
        const issueDate = new Date(req.body.issueDate);
        const dueDate = new Date(value);
        if (dueDate < issueDate) {
          throw new Error('Due date must be after issue date');
        }
        return true;
      }),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Notes are too long'),
    body('terms')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Terms are too long')
  ],
  update: [
    param('id').isMongoId().withMessage('Invalid invoice ID'),
    body('invoiceNumber')
      .optional()
      .trim()
      .notEmpty().withMessage('Invoice number cannot be empty')
      .isLength({ max: 50 }).withMessage('Invoice number is too long'),
    body('customer.name')
      .optional()
      .trim()
      .notEmpty().withMessage('Customer name cannot be empty')
      .isLength({ max: 200 }).withMessage('Customer name is too long'),
    body('customer.email')
      .optional()
      .trim()
      .isEmail().withMessage('Please provide a valid customer email')
      .normalizeEmail(),
    body('customer.phone')
      .optional()
      .trim()
      .matches(/^[\d\s\-\+\(\)]+$/).withMessage('Invalid phone number format'),
    body('customer.address')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Address is too long'),
    body('items')
      .optional()
      .isArray({ min: 1 }).withMessage('At least one item is required'),
    body('items.*.description')
      .optional()
      .trim()
      .notEmpty().withMessage('Item description cannot be empty')
      .isLength({ max: 500 }).withMessage('Item description is too long'),
    body('items.*.quantity')
      .optional()
      .isFloat({ min: 0.01 }).withMessage('Item quantity must be greater than 0'),
    body('items.*.unitPrice')
      .optional()
      .isFloat({ min: 0 }).withMessage('Item unit price must be non-negative'),
    body('amounts.subtotal')
      .optional()
      .isFloat({ min: 0 }).withMessage('Subtotal must be non-negative'),
    body('amounts.total')
      .optional()
      .isFloat({ min: 0 }).withMessage('Total amount must be non-negative'),
    body('status')
      .optional()
      .isIn(['draft', 'pending', 'paid', 'overdue', 'cancelled']).withMessage('Invalid status'),
    body('issueDate')
      .optional()
      .isISO8601().withMessage('Invalid issue date format'),
    body('dueDate')
      .optional()
      .isISO8601().withMessage('Invalid due date format')
      .custom((value, { req }) => {
        if (req.body.issueDate) {
          const issueDate = new Date(req.body.issueDate);
          const dueDate = new Date(value);
          if (dueDate < issueDate) {
            throw new Error('Due date must be after issue date');
          }
        }
        return true;
      }),
    body('notes')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Notes are too long')
  ],
  sendEmail: [
    param('id').isMongoId().withMessage('Invalid invoice ID'),
    body('recipientEmail')
      .optional()
      .trim()
      .isEmail().withMessage('Please provide a valid recipient email')
      .normalizeEmail(),
    body('subject')
      .optional()
      .trim()
      .isLength({ max: 200 }).withMessage('Subject is too long'),
    body('message')
      .optional()
      .trim()
      .isLength({ max: 2000 }).withMessage('Message is too long')
  ]
};

module.exports = {
  validate,
  parseFormDataJSON,
  userValidation,
  authValidation,
  inventoryValidation,
  invoiceValidation
};
