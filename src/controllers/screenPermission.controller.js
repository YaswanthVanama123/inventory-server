const screenPermissionService = require('../services/screenPermission.service');

const SCREEN_CACHE = new Map();
const SCREEN_CACHE_TTL_MS = parseInt(process.env.SCREEN_CACHE_TTL_MS) || 60000;

const cacheGet = (userId) => {
  const entry = SCREEN_CACHE.get(userId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    SCREEN_CACHE.delete(userId);
    return null;
  }
  return entry.value;
};

const cacheSet = (userId, value) => {
  SCREEN_CACHE.set(userId, { value, expiresAt: Date.now() + SCREEN_CACHE_TTL_MS });
};

const cacheInvalidate = (userId) => {
  if (userId) SCREEN_CACHE.delete(String(userId));
  else SCREEN_CACHE.clear();
};

// Get all screens
exports.getAllScreens = async (req, res) => {
  try {
    const { search, page, limit, category } = req.query;
    const screens = await screenPermissionService.getAllScreens(search, page, limit, category);
    res.json({
      success: true,
      data: screens
    });
  } catch (error) {
    console.error('Error getting all screens:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get a single screen by ID
exports.getScreenById = async (req, res) => {
  try {
    const { screenId } = req.params;
    const screen = await screenPermissionService.getScreenById(screenId);
    res.json({
      success: true,
      data: screen
    });
  } catch (error) {
    console.error('Error getting screen:', error);
    res.status(error.message === 'Screen not found' ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

// Create a new screen
exports.createScreen = async (req, res) => {
  try {
    const screenData = req.body;
    const screen = await screenPermissionService.createScreen(screenData);
    res.status(201).json({
      success: true,
      data: screen,
      message: 'Screen created successfully'
    });
  } catch (error) {
    console.error('Error creating screen:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Update a screen
exports.updateScreen = async (req, res) => {
  try {
    const { screenId } = req.params;
    const updateData = req.body;
    const screen = await screenPermissionService.updateScreen(screenId, updateData);
    res.json({
      success: true,
      data: screen,
      message: 'Screen updated successfully'
    });
  } catch (error) {
    console.error('Error updating screen:', error);
    res.status(error.message === 'Screen not found' ? 404 : 400).json({
      success: false,
      message: error.message
    });
  }
};

// Delete a screen
exports.deleteScreen = async (req, res) => {
  try {
    const { screenId } = req.params;
    const result = await screenPermissionService.deleteScreen(screenId);
    res.json({
      success: true,
      message: result.message
    });
  } catch (error) {
    console.error('Error deleting screen:', error);
    res.status(error.message === 'Screen not found' ? 404 : 500).json({
      success: false,
      message: error.message
    });
  }
};

// Get default screens
exports.getDefaultScreens = async (req, res) => {
  try {
    const screens = await screenPermissionService.getDefaultScreens();
    res.json({
      success: true,
      data: screens
    });
  } catch (error) {
    console.error('Error getting default screens:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update default screens
exports.updateDefaultScreens = async (req, res) => {
  try {
    const { screenIds } = req.body;
    const adminId = req.user._id;

    const screens = await screenPermissionService.updateDefaultScreens(screenIds, adminId);

    cacheInvalidate();

    res.json({
      success: true,
      data: screens,
      message: 'Default screens updated successfully'
    });
  } catch (error) {
    console.error('Error updating default screens:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getMyScreens = async (req, res) => {
  try {
    const userId = String(req.user._id);
    const cached = cacheGet(userId);
    if (cached) {
      return res.json({ success: true, data: cached });
    }
    const screens = await screenPermissionService.getUserScreens(userId);
    cacheSet(userId, screens);
    res.json({ success: true, data: screens });
  } catch (error) {
    console.error('Error getting user screens:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get screens for a specific user (admin only)
exports.getUserScreens = async (req, res) => {
  try {
    const { userId } = req.params;
    const screens = await screenPermissionService.getUserScreens(userId);

    res.json({
      success: true,
      data: screens
    });
  } catch (error) {
    console.error('Error getting user screens:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user-specific permissions (additional screens)
exports.getUserSpecificPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const permissions = await screenPermissionService.getUserSpecificPermissions(userId);

    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error getting user permissions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user-specific permissions
exports.updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { screenIds } = req.body;
    const adminId = req.user._id;

    const permissions = await screenPermissionService.updateUserPermissions(
      userId,
      screenIds,
      adminId
    );

    cacheInvalidate(userId);

    res.json({
      success: true,
      data: permissions,
      message: 'User permissions updated successfully'
    });
  } catch (error) {
    console.error('Error updating user permissions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Initialize default screens
exports.initializeScreens = async (req, res) => {
  try {
    const screens = await screenPermissionService.initializeDefaultScreens();

    res.json({
      success: true,
      data: screens,
      message: 'Screens initialized successfully'
    });
  } catch (error) {
    console.error('Error initializing screens:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all users with their permissions summary
exports.getAllUsersWithPermissions = async (req, res) => {
  try {
    const { search } = req.query;
    const users = await screenPermissionService.getAllUsersWithPermissions(search);

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error getting users with permissions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
