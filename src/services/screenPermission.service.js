const Screen = require('../models/Screen');
const UserScreenPermission = require('../models/UserScreenPermission');
const User = require('../models/User');

class ScreenPermissionService {
  // Get all screens
  async getAllScreens() {
    try {
      const screens = await Screen.find({ isActive: true })
        .sort({ category: 1, order: 1, displayName: 1 });
      return screens;
    } catch (error) {
      throw new Error(`Failed to get screens: ${error.message}`);
    }
  }

  // Get default screens
  async getDefaultScreens() {
    try {
      const screens = await Screen.find({ isDefault: true, isActive: true })
        .sort({ category: 1, order: 1, displayName: 1 });
      return screens;
    } catch (error) {
      throw new Error(`Failed to get default screens: ${error.message}`);
    }
  }

  // Update default screens
  async updateDefaultScreens(screenIds, adminId) {
    try {
      // Remove isDefault from all screens
      await Screen.updateMany({}, { isDefault: false });

      // Set isDefault for selected screens
      if (screenIds && screenIds.length > 0) {
        await Screen.updateMany(
          { _id: { $in: screenIds } },
          { isDefault: true }
        );
      }

      return await this.getDefaultScreens();
    } catch (error) {
      throw new Error(`Failed to update default screens: ${error.message}`);
    }
  }

  // Get screens for a specific user (default + user-specific)
  async getUserScreens(userId) {
    try {
      // Get default screens
      const defaultScreens = await Screen.find({ isDefault: true, isActive: true })
        .sort({ category: 1, order: 1, displayName: 1 })
        .lean();

      // Get user-specific permissions
      const userPermissions = await UserScreenPermission.find({
        userId,
        hasAccess: true
      })
        .populate('screenId')
        .lean();

      // Combine default screens and user-specific screens
      const defaultScreenIds = defaultScreens.map(s => s._id.toString());
      const userScreens = userPermissions
        .filter(p => p.screenId && p.screenId.isActive)
        .map(p => p.screenId)
        .filter(s => !defaultScreenIds.includes(s._id.toString()));

      const allScreens = [...defaultScreens, ...userScreens];

      // Sort by category and order
      allScreens.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.displayName.localeCompare(b.displayName);
      });

      return allScreens;
    } catch (error) {
      throw new Error(`Failed to get user screens: ${error.message}`);
    }
  }

  // Get user-specific permissions (additional screens beyond default)
  async getUserSpecificPermissions(userId) {
    try {
      const permissions = await UserScreenPermission.find({ userId, hasAccess: true })
        .populate('screenId')
        .populate('grantedBy', 'name email')
        .lean();

      return permissions
        .filter(p => p.screenId && p.screenId.isActive)
        .map(p => ({
          ...p,
          screen: p.screenId
        }));
    } catch (error) {
      throw new Error(`Failed to get user permissions: ${error.message}`);
    }
  }

  // Update user-specific permissions
  async updateUserPermissions(userId, screenIds, adminId) {
    try {
      // Get default screen IDs to exclude them
      const defaultScreens = await Screen.find({ isDefault: true, isActive: true });
      const defaultScreenIds = defaultScreens.map(s => s._id.toString());

      // Filter out default screens from the provided screenIds
      const additionalScreenIds = screenIds.filter(id => !defaultScreenIds.includes(id.toString()));

      // Remove all existing user-specific permissions
      await UserScreenPermission.deleteMany({ userId });

      // Add new permissions for additional screens
      if (additionalScreenIds.length > 0) {
        const permissions = additionalScreenIds.map(screenId => ({
          userId,
          screenId,
          hasAccess: true,
          grantedBy: adminId,
          grantedAt: new Date()
        }));

        await UserScreenPermission.insertMany(permissions);
      }

      return await this.getUserSpecificPermissions(userId);
    } catch (error) {
      throw new Error(`Failed to update user permissions: ${error.message}`);
    }
  }

  // Create or update a screen
  async createOrUpdateScreen(screenData) {
    try {
      const { name, ...updateData } = screenData;

      const screen = await Screen.findOneAndUpdate(
        { name },
        { name, ...updateData },
        { new: true, upsert: true, runValidators: true }
      );

      return screen;
    } catch (error) {
      throw new Error(`Failed to create/update screen: ${error.message}`);
    }
  }

  // Initialize default screens (run once during setup)
  async initializeDefaultScreens() {
    try {
      const defaultScreens = [
        // Dashboard
        { name: 'dashboard', displayName: 'Dashboard', path: '/', icon: 'HomeIcon', category: 'Dashboard', isDefault: true, order: 1 },

        // RouteStar
        { name: 'routestar-invoices', displayName: 'RouteStar Invoices', path: '/routestar/invoices', icon: 'DocumentTextIcon', category: 'RouteStar', isDefault: true, order: 2 },
        { name: 'routestar-closed-invoices', displayName: 'Closed Invoice Customers', path: '/routestar/closed-invoice-customers', icon: 'UserGroupIcon', category: 'RouteStar', isDefault: true, order: 3 },

        // CustomerConnect
        { name: 'customerconnect-transactions', displayName: 'CustomerConnect Transactions', path: '/customerconnect/transactions', icon: 'CreditCardIcon', category: 'CustomerConnect', isDefault: false, order: 4 },

        // GoAudits
        { name: 'goaudits-locations', displayName: 'GoAudits Locations', path: '/goaudits/locations', icon: 'LocationMarkerIcon', category: 'GoAudits', isDefault: false, order: 5 },

        // Reports
        { name: 'reports', displayName: 'Reports', path: '/reports', icon: 'ChartBarIcon', category: 'Reports', isDefault: false, order: 6 },

        // Settings
        { name: 'settings', displayName: 'Settings', path: '/settings', icon: 'CogIcon', category: 'Settings', isDefault: false, order: 7 }
      ];

      const results = [];
      for (const screenData of defaultScreens) {
        const screen = await this.createOrUpdateScreen(screenData);
        results.push(screen);
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to initialize screens: ${error.message}`);
    }
  }

  // Get all users with their screen permissions summary
  async getAllUsersWithPermissions() {
    try {
      const users = await User.find({ role: { $ne: 'admin' } })
        .select('name email role')
        .lean();

      const defaultScreens = await this.getDefaultScreens();
      const defaultCount = defaultScreens.length;

      const usersWithPermissions = await Promise.all(
        users.map(async (user) => {
          const specificPermissions = await UserScreenPermission.countDocuments({
            userId: user._id,
            hasAccess: true
          });

          return {
            ...user,
            defaultScreensCount: defaultCount,
            additionalScreensCount: specificPermissions,
            totalScreensCount: defaultCount + specificPermissions
          };
        })
      );

      return usersWithPermissions;
    } catch (error) {
      throw new Error(`Failed to get users with permissions: ${error.message}`);
    }
  }
}

module.exports = new ScreenPermissionService();
