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

  // Create a new screen
  async createScreen(screenData) {
    try {
      // Check if screen with same name or path already exists
      const existingScreen = await Screen.findOne({
        $or: [
          { name: screenData.name },
          { path: screenData.path }
        ]
      });

      if (existingScreen) {
        throw new Error('Screen with this name or path already exists');
      }

      const screen = new Screen(screenData);
      await screen.save();

      return screen;
    } catch (error) {
      throw new Error(`Failed to create screen: ${error.message}`);
    }
  }

  // Update a screen
  async updateScreen(screenId, updateData) {
    try {
      // If updating name or path, check for duplicates
      if (updateData.name || updateData.path) {
        const existingScreen = await Screen.findOne({
          _id: { $ne: screenId },
          $or: [
            ...(updateData.name ? [{ name: updateData.name }] : []),
            ...(updateData.path ? [{ path: updateData.path }] : [])
          ]
        });

        if (existingScreen) {
          throw new Error('Screen with this name or path already exists');
        }
      }

      const screen = await Screen.findByIdAndUpdate(
        screenId,
        updateData,
        { new: true, runValidators: true }
      );

      if (!screen) {
        throw new Error('Screen not found');
      }

      return screen;
    } catch (error) {
      throw new Error(`Failed to update screen: ${error.message}`);
    }
  }

  // Delete a screen
  async deleteScreen(screenId) {
    try {
      const screen = await Screen.findById(screenId);

      if (!screen) {
        throw new Error('Screen not found');
      }

      // Delete all user permissions for this screen
      await UserScreenPermission.deleteMany({ screenId });

      // Delete the screen
      await Screen.findByIdAndDelete(screenId);

      return { message: 'Screen and associated permissions deleted successfully' };
    } catch (error) {
      throw new Error(`Failed to delete screen: ${error.message}`);
    }
  }

  // Get a single screen by ID
  async getScreenById(screenId) {
    try {
      const screen = await Screen.findById(screenId);

      if (!screen) {
        throw new Error('Screen not found');
      }

      return screen;
    } catch (error) {
      throw new Error(`Failed to get screen: ${error.message}`);
    }
  }

  // Initialize default screens (run once during setup)
  async initializeDefaultScreens() {
    try {
      const defaultScreens = [
        // Core
        { name: 'dashboard', displayName: 'Dashboard', path: '/dashboard', icon: 'DashboardIcon', category: 'Core', isDefault: true, order: 1 },

        // Inventory Management
        { name: 'stock', displayName: 'Stock', path: '/stock', icon: 'PackageIcon', category: 'Inventory', isDefault: true, order: 2 },
        { name: 'inventory', displayName: 'Inventory Items', path: '/inventory', icon: 'InventoryIcon', category: 'Inventory', isDefault: true, order: 3 },
        { name: 'discrepancies', displayName: 'Discrepancies', path: '/discrepancies', icon: 'AlertTriangleIcon', category: 'Inventory', isDefault: true, order: 4 },

        // Daily Operations
        { name: 'orders', displayName: 'Orders', path: '/orders', icon: 'ShoppingCartIcon', category: 'Operations', isDefault: true, order: 5 },
        { name: 'truck-checkouts', displayName: 'Truck Checkouts', path: '/truck-checkouts', icon: 'TruckIcon', category: 'Operations', isDefault: true, order: 6 },
        { name: 'invoices', displayName: 'Invoices', path: '/invoices', icon: 'InvoicesIcon', category: 'Operations', isDefault: true, order: 7 },
        { name: 'invoices-routestar-pending', displayName: 'Pending Invoices (RouteStar)', path: '/invoices/routestar/pending', icon: 'ClockHistoryIcon', category: 'Operations', isDefault: true, order: 8 },
        { name: 'invoices-routestar-closed', displayName: 'Closed Invoices (RouteStar)', path: '/invoices/routestar/closed', icon: 'CheckCircleIcon', category: 'Operations', isDefault: true, order: 9 },

        // RouteStar Integration
        { name: 'routestar-items', displayName: 'RouteStar Items', path: '/routestar/items', icon: 'CubeIcon', category: 'RouteStar', isDefault: false, order: 10 },
        { name: 'routestar-model-mapping', displayName: 'Model Mapping', path: '/routestar/model-mapping', icon: 'LinkIcon', category: 'RouteStar', isDefault: false, order: 11 },
        { name: 'routestar-item-alias-mapping', displayName: 'Item Alias Mapping', path: '/routestar/item-alias-mapping', icon: 'LinkIcon', category: 'RouteStar', isDefault: false, order: 12 },

        // Master Data
        { name: 'vendors', displayName: 'Vendors', path: '/vendors', icon: 'BuildingIcon', category: 'Master Data', isDefault: false, order: 13 },
        { name: 'manual-po-items', displayName: 'Manual PO Items', path: '/manual-po-items', icon: 'TagIcon', category: 'Master Data', isDefault: false, order: 14 },

        // Reports & Analytics
        { name: 'sales-report', displayName: 'Sales Report', path: '/routestar/sales-report', icon: 'ChartIcon', category: 'Reports', isDefault: false, order: 15 },
        { name: 'items-invoice-usage', displayName: 'Items Invoice Usage', path: '/routestar/items-invoice-usage', icon: 'FolderIcon', category: 'Reports', isDefault: false, order: 16 },
        { name: 'activities', displayName: 'Employee Activities', path: '/activities', icon: 'ActivityIcon', category: 'Reports', isDefault: false, order: 17 },

        // System & Admin
        { name: 'users', displayName: 'Users', path: '/users', icon: 'UsersIcon', category: 'Administration', isDefault: false, order: 18 },
        { name: 'screen-permissions', displayName: 'Screen Permissions', path: '/admin/screen-permissions', icon: 'ShieldCheckIcon', category: 'Administration', isDefault: false, order: 19 },
        { name: 'screen-management', displayName: 'Screen Management', path: '/admin/screens', icon: 'ClipboardListIcon', category: 'Administration', isDefault: false, order: 20 },
        { name: 'settings', displayName: 'Settings', path: '/settings', icon: 'SettingsIcon', category: 'Administration', isDefault: false, order: 21 },
        { name: 'fetch-history', displayName: 'Fetch History', path: '/system/fetch-history', icon: 'ClockHistoryIcon', category: 'Administration', isDefault: false, order: 22 },

        // Personal
        { name: 'profile', displayName: 'Profile', path: '/profile', icon: 'ProfileIcon', category: 'Personal', isDefault: false, order: 23 }
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
