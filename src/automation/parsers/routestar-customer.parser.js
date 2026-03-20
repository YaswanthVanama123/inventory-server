class RouteStarCustomerParser {
  static parseCustomerList(rawCustomer) {
    return {
      customerId: rawCustomer.customerId || null,
      customerName: rawCustomer.customerName || null,
      contact: rawCustomer.contact || null,
      email: rawCustomer.email || null,
      phone: rawCustomer.phone || null,
      serviceAddress1: rawCustomer.serviceAddress1 || null,
      serviceCity: rawCustomer.serviceCity || null,
      serviceState: rawCustomer.serviceState || null,
      serviceZip: rawCustomer.serviceZip || null,
      accountNumber: rawCustomer.accountNumber || null,
      balance: rawCustomer.balance || 0,
      customerType: rawCustomer.customerType || null,
      salesRep: rawCustomer.salesRep || null,
      status: rawCustomer.status || null,
      onRoute: rawCustomer.onRoute || null,
      lastServiceDate: rawCustomer.lastServiceDate || null,
      zone: rawCustomer.zone || null,
      lastSyncDate: new Date(),
      rawData: rawCustomer
    };
  }

  static parseCustomerDetails(customerId, details) {
    const customer = {
      customerId,

      // Basic Info
      customerName: details.basicInfo.customerName || null,
      company: details.basicInfo.company || null,
      contact: details.basicInfo.contact || null,
      firstName: details.basicInfo.firstName || null,
      lastName: details.basicInfo.lastName || null,
      email: details.basicInfo.email || null,
      ccEmail: details.basicInfo.ccEmail || null,
      phone: details.basicInfo.phone || null,
      altPhone: details.basicInfo.altPhone || null,
      mobilePhone: details.basicInfo.mobilePhone || null,

      // Billing Address
      billingAddress1: details.billingAddress.billingAddress1 || null,
      billingAddress2: details.billingAddress.billingAddress2 || null,
      billingAddress3: details.billingAddress.billingAddress3 || null,
      billingCity: details.billingAddress.billingCity || null,
      billingState: details.billingAddress.billingState || null,
      billingZip: details.billingAddress.billingZip || null,

      // Service Address
      serviceAddress1: details.serviceAddress.serviceAddress1 || null,
      serviceAddress2: details.serviceAddress.serviceAddress2 || null,
      serviceAddress3: details.serviceAddress.serviceAddress3 || null,
      serviceCity: details.serviceAddress.serviceCity || null,
      serviceState: details.serviceAddress.serviceState || null,
      serviceZip: details.serviceAddress.serviceZip || null,
      latitude: details.serviceAddress.latitude || null,
      longitude: details.serviceAddress.longitude || null,
      zone: details.serviceAddress.zone || null,

      // Account Info
      accountNumber: details.accountInfo.accountNumber || null,
      balance: details.accountInfo.balance || 0,
      creditLimit: details.accountInfo.creditLimit || null,
      accountValue: details.accountInfo.accountValue || null,

      // Tax & Payment
      taxCode: details.taxAndPayment.taxCode || null,
      taxRate: details.taxAndPayment.taxRate || null,
      terms: details.taxAndPayment.terms || null,
      preferredPaymentMethod: details.taxAndPayment.preferredPaymentMethod || null,

      // Classification
      customerType: details.classification.customerType || null,
      salesRep: details.classification.salesRep || null,
      grouping: details.classification.grouping || null,
      priceLevel: details.classification.priceLevel || null,
      priceGrouping: details.classification.priceGrouping || null,
      status: details.classification.status || null,

      // Settings
      active: details.settings.active !== null ? details.settings.active : true,
      paperless: details.settings.paperless || false,
      proofOfService: details.settings.proofOfService || false,
      hideMobileEmailOption: details.settings.hideMobileEmailOption || false,
      addChargeOnBatchBilling: details.settings.addChargeOnBatchBilling || false,

      // Additional Info
      notificationMethod: details.additionalInfo.notificationMethod || null,
      parentCustomer: details.additionalInfo.parentCustomer || null,
      billAnotherCustomer: details.additionalInfo.billAnotherCustomer || null,
      customerPopupMessage: details.additionalInfo.customerPopupMessage || null,
      hoaCode: details.additionalInfo.hoaCode || null,
      onRoute: details.additionalInfo.onRoute || null,
      routeMaintPlan: details.additionalInfo.routeMaintPlan || null,
      defaultDeliveryMethod: details.additionalInfo.defaultDeliveryMethod || null,
      mapBook: details.additionalInfo.mapBook || null,
      mapPage: details.additionalInfo.mapPage || null,
      blanketPONumber: details.additionalInfo.blanketPONumber || null,
      taxKeyNo: details.additionalInfo.taxKeyNo || null,
      permitNumber: details.additionalInfo.permitNumber || null,
      county: details.additionalInfo.county || null,
      commission: details.additionalInfo.commission || null,
      systemType: details.additionalInfo.systemType || null,
      lastServiceDate: details.additionalInfo.lastServiceDate || null,
      drivingDirections: details.additionalInfo.drivingDirections || null,

      lastSyncDate: new Date(),
      rawData: details
    };

    return customer;
  }

  static parseContacts(customerId, contacts) {
    return contacts.map(contact => ({
      customerId,
      contactName: contact.contactName || null,
      notifyBy: contact.notifyBy || null,
      email: contact.email || null,
      phone: contact.phone || null,
      rawData: contact
    }));
  }

  static parseEquipment(customerId, equipment) {
    return equipment.map(item => ({
      customerId,
      equipmentType: item.equipmentType || null,
      description: item.description || null,
      serialNumber: item.serialNumber || null,
      rawData: item
    }));
  }

  static parseRoutes(customerId, routes) {
    return routes.map(route => ({
      customerId,
      routeName: route.routeName || null,
      frequency: route.frequency || null,
      status: route.status || null,
      rawData: route
    }));
  }

  static parseNotes(customerId, notes) {
    return notes.map(note => ({
      customerId,
      noteText: note.noteText || null,
      createdBy: note.createdBy || null,
      createdDate: note.createdDate ? new Date(note.createdDate) : null,
      rawData: note
    }));
  }

  static parseActivities(customerId, activities) {
    return activities.map(activity => ({
      customerId,
      activityDate: activity.activityDate ? new Date(activity.activityDate) : null,
      activityType: activity.activityType || null,
      description: activity.description || null,
      amount: activity.amount || null,
      rawData: activity
    }));
  }

  static parseAttachments(customerId, attachments) {
    return attachments.map(attachment => ({
      customerId,
      fileName: attachment.fileName || null,
      uploadedDate: attachment.uploadedDate ? new Date(attachment.uploadedDate) : null,
      fileUrl: attachment.fileUrl || null,
      rawData: attachment
    }));
  }

  static parsePricing(customerId, pricing) {
    return pricing.map(item => ({
      customerId,
      itemName: item.itemName || null,
      unitPrice: item.unitPrice || null,
      discount: item.discount || null,
      rawData: item
    }));
  }

  static parseBillingInfo(customerId, billingInfo) {
    return {
      customerId,
      billingFrequency: billingInfo.billingFrequency || null,
      billingMethod: billingInfo.billingMethod || null,
      invoiceDelivery: billingInfo.invoiceDelivery || null,
      paymentTerms: billingInfo.paymentTerms || null,
      autoPay: billingInfo.autoPay || false,
      rawData: billingInfo
    };
  }
}

module.exports = RouteStarCustomerParser;
