const Screen = require('../models/Screen');
const UserScreenPermission = require('../models/UserScreenPermission');
const User = require('../models/User');

class ScreenPermissionService {
  async getAllScreens(search, page, limit, category) {
    try {
      const query = { isActive: true };
      if (category) {
        query.category = category;
      }
      if (search) {
        query.$or = [
          { displayName: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { path: { $regex: search, $options: 'i' } }
        ];
      }
      const sort = { category: 1, order: 1, displayName: 1 };
      const lim = parseInt(limit, 10);
      const pg = parseInt(page, 10) || 1;
      if (!lim || lim <= 0) {
        return await Screen.find(query).sort(sort);
      }
      const [screens, total] = await Promise.all([
        Screen.find(query).sort(sort).skip((pg - 1) * lim).limit(lim),
        Screen.countDocuments(query)
      ]);
      return { screens, total, page: pg, pages: Math.ceil(total / lim) };
    } catch (error) {
      throw new Error(`Failed to get screens: ${error.message}`);
    }
  }

  async getDefaultScreens() {
    try {
      const screens = await Screen.find({ isDefault: true, isActive: true })
        .sort({ category: 1, order: 1, displayName: 1 });
      return screens;
    } catch (error) {
      throw new Error(`Failed to get default screens: ${error.message}`);
    }
  }

  async updateDefaultScreens(screenIds, adminId) {
    try {
      await Screen.updateMany({}, { isDefault: false });

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

  async getUserScreens(userId) {
    try {
      const defaultScreens = await Screen.find({ isDefault: true, isActive: true })
        .sort({ category: 1, order: 1, displayName: 1 })
        .lean();

      const userPermissions = await UserScreenPermission.find({
        userId,
        hasAccess: true
      })
        .populate('screenId')
        .lean();

      const defaultScreenIds = defaultScreens.map(s => s._id.toString());
      const userScreens = userPermissions
        .filter(p => p.screenId && p.screenId.isActive)
        .map(p => p.screenId)
        .filter(s => !defaultScreenIds.includes(s._id.toString()));

      const allScreens = [...defaultScreens, ...userScreens];

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

  async updateUserPermissions(userId, screenIds, adminId) {
    try {
      const defaultScreens = await Screen.find({ isDefault: true, isActive: true });
      const defaultScreenIds = defaultScreens.map(s => s._id.toString());

      const additionalScreenIds = screenIds.filter(id => !defaultScreenIds.includes(id.toString()));

      await UserScreenPermission.deleteMany({ userId });

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

  async createScreen(screenData) {
    try {
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

  async updateScreen(screenId, updateData) {
    try {
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

  async deleteScreen(screenId) {
    try {
      const screen = await Screen.findById(screenId);

      if (!screen) {
        throw new Error('Screen not found');
      }

      await UserScreenPermission.deleteMany({ screenId });

      await Screen.findByIdAndDelete(screenId);

      return { message: 'Screen and associated permissions deleted successfully' };
    } catch (error) {
      throw new Error(`Failed to delete screen: ${error.message}`);
    }
  }

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

  async initializeDefaultScreens() {
    try {
      const defaultScreens = [
        { name: 'dashboard', displayName: 'Dashboard', path: '/dashboard', icon: 'DashboardIcon', category: 'Core', isDefault: true, order: 1 },

        { name: 'stock', displayName: 'Stock', path: '/stock', icon: 'PackageIcon', category: 'Inventory', isDefault: true, order: 2 },
        { name: 'inventory', displayName: 'Inventory Items', path: '/inventory', icon: 'InventoryIcon', category: 'Inventory', isDefault: true, order: 3 },
        { name: 'discrepancies', displayName: 'Discrepancies', path: '/discrepancies', icon: 'AlertTriangleIcon', category: 'Inventory', isDefault: true, order: 4 },

        { name: 'orders', displayName: 'Orders', path: '/orders', icon: 'ShoppingCartIcon', category: 'Operations', isDefault: true, order: 5 },
        { name: 'truck-checkouts', displayName: 'Truck Checkouts', path: '/truck-checkouts', icon: 'TruckIcon', category: 'Operations', isDefault: true, order: 6 },
        { name: 'invoices', displayName: 'Invoices', path: '/invoices', icon: 'InvoicesIcon', category: 'Operations', isDefault: true, order: 7 },
        { name: 'invoices-routestar-pending', displayName: 'Pending Invoices (RouteStar)', path: '/invoices/routestar/pending', icon: 'ClockHistoryIcon', category: 'Operations', isDefault: true, order: 8 },
        { name: 'invoices-routestar-closed', displayName: 'Closed Invoices (RouteStar)', path: '/invoices/routestar/closed', icon: 'CheckCircleIcon', category: 'Operations', isDefault: true, order: 9 },

        { name: 'routestar-items', displayName: 'RouteStar Items', path: '/routestar/items', icon: 'CubeIcon', category: 'RouteStar', isDefault: false, order: 10 },
        { name: 'routestar-model-mapping', displayName: 'Model Mapping', path: '/routestar/model-mapping', icon: 'LinkIcon', category: 'RouteStar', isDefault: false, order: 11 },
        { name: 'routestar-item-alias-mapping', displayName: 'Item Alias Mapping', path: '/routestar/item-alias-mapping', icon: 'LinkIcon', category: 'RouteStar', isDefault: false, order: 12 },

        { name: 'vendors', displayName: 'Vendors', path: '/vendors', icon: 'BuildingIcon', category: 'Master Data', isDefault: false, order: 13 },
        { name: 'manual-po-items', displayName: 'Manual PO Items', path: '/manual-po-items', icon: 'TagIcon', category: 'Master Data', isDefault: false, order: 14 },
        { name: 'case-quantity-mapping', displayName: 'Case Quantity Mapping', path: '/case-quantity-mapping', icon: 'CubeIcon', category: 'Master Data', isDefault: false, order: 15 },

        { name: 'sales-report', displayName: 'Sales Report', path: '/routestar/sales-report', icon: 'ChartIcon', category: 'Reports', isDefault: false, order: 15 },
        { name: 'items-invoice-usage', displayName: 'Items Invoice Usage', path: '/routestar/items-invoice-usage', icon: 'FolderIcon', category: 'Reports', isDefault: false, order: 16 },
        { name: 'activities', displayName: 'Employee Activities', path: '/activities', icon: 'ActivityIcon', category: 'Reports', isDefault: false, order: 17 },

        { name: 'users', displayName: 'Users', path: '/users', icon: 'UsersIcon', category: 'Administration', isDefault: false, order: 18 },
        { name: 'screen-permissions', displayName: 'Screen Permissions', path: '/admin/screen-permissions', icon: 'ShieldCheckIcon', category: 'Administration', isDefault: false, order: 19 },
        { name: 'screen-management', displayName: 'Screen Management', path: '/admin/screens', icon: 'ClipboardListIcon', category: 'Administration', isDefault: false, order: 20 },
        { name: 'data-cleanup', displayName: 'Data Cleanup', path: '/admin/data-cleanup', icon: 'TrashIcon', category: 'Administration', isDefault: false, order: 20.5 },
        { name: 'settings', displayName: 'Settings', path: '/settings', icon: 'SettingsIcon', category: 'Administration', isDefault: false, order: 21 },
        { name: 'fetch-history', displayName: 'Fetch History', path: '/system/fetch-history', icon: 'ClockHistoryIcon', category: 'Administration', isDefault: false, order: 22 },

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

  async getAllUsersWithPermissions(search) {
    try {
      const query = { role: { $ne: 'admin' } };
      if (search) {
        query.$or = [
          { username: { $regex: search, $options: 'i' } },
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }
      const users = await User.find(query)
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
