const RouteStarCustomer = require('../models/RouteStarCustomer');
const RouteStarCustomerContact = require('../models/RouteStarCustomerContact');
const RouteStarCustomerEquipment = require('../models/RouteStarCustomerEquipment');
const RouteStarCustomerRoute = require('../models/RouteStarCustomerRoute');
const RouteStarCustomerNote = require('../models/RouteStarCustomerNote');
const RouteStarCustomerActivity = require('../models/RouteStarCustomerActivity');
const RouteStarCustomerAttachment = require('../models/RouteStarCustomerAttachment');
const RouteStarCustomerPricing = require('../models/RouteStarCustomerPricing');
const RouteStarCustomerBillingInfo = require('../models/RouteStarCustomerBillingInfo');
const RouteStarCustomerParser = require('../automation/parsers/routestar-customer.parser');

class RouteStarCustomerService {
  async getCustomers(filters, pagination) {
    const query = {};

    if (filters.search) {
      query.$or = [
        { customerName: { $regex: filters.search, $options: 'i' } },
        { customerId: { $regex: filters.search, $options: 'i' } },
        { email: { $regex: filters.search, $options: 'i' } },
        { phone: { $regex: filters.search, $options: 'i' } },
        { accountNumber: { $regex: filters.search, $options: 'i' } }
      ];
    }

    if (filters.customerType) {
      query.customerType = filters.customerType;
    }

    if (filters.salesRep) {
      query.salesRep = filters.salesRep;
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.active !== undefined) {
      query.active = filters.active === 'true' || filters.active === true;
    }

    const skip = (pagination.page - 1) * pagination.limit;
    const sortField = pagination.sortBy || 'customerName';
    const sortOrder = pagination.sortOrder === 'desc' ? -1 : 1;

    const [customers, totalCount] = await Promise.all([
      RouteStarCustomer.find(query)
        .limit(parseInt(pagination.limit))
        .skip(skip)
        .sort({ [sortField]: sortOrder })
        .lean(),
      RouteStarCustomer.countDocuments(query)
    ]);

    return {
      customers,
      pagination: {
        currentPage: parseInt(pagination.page),
        totalPages: Math.ceil(totalCount / pagination.limit),
        totalCount,
        limit: parseInt(pagination.limit)
      }
    };
  }

  async getCustomerById(customerId) {
    const customer = await RouteStarCustomer.findOne({ customerId }).lean();

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Fetch related data
    const [contacts, equipment, routes, notes, activities, attachments, pricing, billingInfo] = await Promise.all([
      RouteStarCustomerContact.find({ customerId }).lean(),
      RouteStarCustomerEquipment.find({ customerId }).lean(),
      RouteStarCustomerRoute.find({ customerId }).lean(),
      RouteStarCustomerNote.find({ customerId }).lean(),
      RouteStarCustomerActivity.find({ customerId }).lean(),
      RouteStarCustomerAttachment.find({ customerId }).lean(),
      RouteStarCustomerPricing.find({ customerId }).lean(),
      RouteStarCustomerBillingInfo.findOne({ customerId }).lean()
    ]);

    return {
      ...customer,
      contacts,
      equipment,
      routes,
      notes,
      activities,
      attachments,
      pricing,
      billingInfo
    };
  }

  async syncCustomers(customersData) {
    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    for (const rawCustomer of customersData) {
      try {
        const parsedCustomer = RouteStarCustomerParser.parseCustomerList(rawCustomer);

        const existingCustomer = await RouteStarCustomer.findOne({ customerId: parsedCustomer.customerId });

        if (existingCustomer) {
          await RouteStarCustomer.updateOne({ customerId: parsedCustomer.customerId }, parsedCustomer);
          results.updated++;
        } else {
          await RouteStarCustomer.create(parsedCustomer);
          results.created++;
        }
      } catch (error) {
        results.errors.push({
          customerId: rawCustomer.customerId,
          error: error.message
        });
      }
    }

    return results;
  }

  async syncCustomerDetails(customerId, details) {
    try {
      // Parse and save main customer data
      const parsedCustomer = RouteStarCustomerParser.parseCustomerDetails(customerId, details);
      await RouteStarCustomer.updateOne(
        { customerId },
        parsedCustomer,
        { upsert: true }
      );

      // Delete existing related records
      await Promise.all([
        RouteStarCustomerContact.deleteMany({ customerId }),
        RouteStarCustomerEquipment.deleteMany({ customerId }),
        RouteStarCustomerRoute.deleteMany({ customerId }),
        RouteStarCustomerNote.deleteMany({ customerId }),
        RouteStarCustomerActivity.deleteMany({ customerId }),
        RouteStarCustomerAttachment.deleteMany({ customerId }),
        RouteStarCustomerPricing.deleteMany({ customerId }),
        RouteStarCustomerBillingInfo.deleteMany({ customerId })
      ]);

      // Insert new related records
      const insertPromises = [];

      if (details.contacts && details.contacts.length > 0) {
        const contacts = RouteStarCustomerParser.parseContacts(customerId, details.contacts);
        insertPromises.push(RouteStarCustomerContact.insertMany(contacts));
      }

      if (details.equipment && details.equipment.length > 0) {
        const equipment = RouteStarCustomerParser.parseEquipment(customerId, details.equipment);
        insertPromises.push(RouteStarCustomerEquipment.insertMany(equipment));
      }

      if (details.routes && details.routes.length > 0) {
        const routes = RouteStarCustomerParser.parseRoutes(customerId, details.routes);
        insertPromises.push(RouteStarCustomerRoute.insertMany(routes));
      }

      if (details.notes && details.notes.length > 0) {
        const notes = RouteStarCustomerParser.parseNotes(customerId, details.notes);
        insertPromises.push(RouteStarCustomerNote.insertMany(notes));
      }

      if (details.activities && details.activities.length > 0) {
        const activities = RouteStarCustomerParser.parseActivities(customerId, details.activities);
        insertPromises.push(RouteStarCustomerActivity.insertMany(activities));
      }

      if (details.attachments && details.attachments.length > 0) {
        const attachments = RouteStarCustomerParser.parseAttachments(customerId, details.attachments);
        insertPromises.push(RouteStarCustomerAttachment.insertMany(attachments));
      }

      if (details.pricing && details.pricing.length > 0) {
        const pricing = RouteStarCustomerParser.parsePricing(customerId, details.pricing);
        insertPromises.push(RouteStarCustomerPricing.insertMany(pricing));
      }

      if (details.billingInfo) {
        const billingInfo = RouteStarCustomerParser.parseBillingInfo(customerId, details.billingInfo);
        insertPromises.push(RouteStarCustomerBillingInfo.create(billingInfo));
      }

      await Promise.all(insertPromises);

      return { success: true, customerId };
    } catch (error) {
      throw new Error(`Failed to sync customer details: ${error.message}`);
    }
  }

  async getCustomerStats() {
    const [
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      customersByType,
      customersBySalesRep
    ] = await Promise.all([
      RouteStarCustomer.countDocuments(),
      RouteStarCustomer.countDocuments({ active: true }),
      RouteStarCustomer.countDocuments({ active: false }),
      RouteStarCustomer.aggregate([
        { $group: { _id: '$customerType', count: { $sum: 1 } } }
      ]),
      RouteStarCustomer.aggregate([
        { $group: { _id: '$salesRep', count: { $sum: 1 } } }
      ])
    ]);

    return {
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      customersByType: customersByType.map(item => ({
        type: item._id,
        count: item.count
      })),
      customersBySalesRep: customersBySalesRep.map(item => ({
        salesRep: item._id,
        count: item.count
      }))
    };
  }

  async deleteAllCustomers() {
    await Promise.all([
      RouteStarCustomerContact.deleteMany({}),
      RouteStarCustomerEquipment.deleteMany({}),
      RouteStarCustomerRoute.deleteMany({}),
      RouteStarCustomerNote.deleteMany({}),
      RouteStarCustomerActivity.deleteMany({}),
      RouteStarCustomerAttachment.deleteMany({}),
      RouteStarCustomerPricing.deleteMany({}),
      RouteStarCustomerBillingInfo.deleteMany({})
    ]);

    const result = await RouteStarCustomer.deleteMany({});

    return { deletedCount: result.deletedCount };
  }
}

module.exports = new RouteStarCustomerService();
