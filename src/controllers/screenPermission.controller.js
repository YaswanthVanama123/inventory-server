const screenPermissionService = require('../services/screenPermission.service');

// Get all screens
exports.getAllScreens = async (req, res) => {
  try {
    const screens = await screenPermissionService.getAllScreens();
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

// Get screens for logged-in user
exports.getMyScreens = async (req, res) => {
  try {
    const userId = req.user._id;
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
    const users = await screenPermissionService.getAllUsersWithPermissions();

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
