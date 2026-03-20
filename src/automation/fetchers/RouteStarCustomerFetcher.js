class RouteStarCustomerFetcher {
  constructor(page, navigator, selectors, baseUrl) {
    this.page = page;
    this.navigator = navigator;
    this.selectors = selectors;
    this.baseUrl = baseUrl;
  }

  async fetchCustomersList(limit = Infinity) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    console.log(`\n📥 Fetching RouteStar Customers ${fetchAll ? '(ALL)' : `(limit: ${limit})`}`);

    await this.navigator.navigateToCustomers();
    return await this.fetchCustomers(limit);
  }

  async fetchCustomers(limit) {
    const fetchAll = limit === Infinity || limit === null || limit === 0;
    const customers = [];
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = fetchAll ? Infinity : Math.ceil(limit / 10);

    console.log(`📊 Pagination settings:`);
    console.log(`   - Fetch all: ${fetchAll}`);
    console.log(`   - Limit: ${limit === Infinity ? 'Infinity' : limit}`);
    console.log(`   - Max pages: ${maxPages === Infinity ? 'Infinity' : maxPages}`);

    while (hasNextPage && pageCount < maxPages) {
      console.log(`\n📄 Processing page ${pageCount + 1}...`);

      try {
        await this.page.waitForSelector('div.ht_master', {
          timeout: 30000,
          state: 'attached'
        });
        console.log('✓ Customer table found in DOM');
      } catch (error) {
        console.log('⚠️  Customer table selector timeout - trying to proceed anyway');
      }

      await this.page.waitForTimeout(3000);

      const masterTable = await this.page.$('div.ht_master');
      if (!masterTable) {
        console.log('⚠️  No master table found - likely no customers on this page');
        if (pageCount === 0) {
          console.log('✓ No customers found (table doesn\'t exist) - this is normal if there are 0 customers');
          break;
        } else {
          console.log('✓ Reached end of pagination (no more pages)');
          break;
        }
      }

      console.log('✓ Found master table');
      const customerRows = await masterTable.$$('table.htCore tbody tr');
      console.log(`   Found ${customerRows.length} rows in table`);

      if (customerRows.length === 0) {
        console.log('⚠️  Table exists but has 0 rows - no customers on this page');
        if (pageCount === 0) {
          console.log('✓ No customers found (empty table) - this is normal if there are 0 customers');
        }
        break;
      }

      for (let i = 0; i < customerRows.length; i++) {
        const row = customerRows[i];

        if (!fetchAll && customers.length >= limit) {
          console.log(`   Reached limit of ${limit} customers, stopping`);
          break;
        }

        try {
          const customerData = await this.extractCustomerListData(row);
          if (customerData) {
            console.log(`  ✓ Row ${i + 1}: Customer ${customerData.customerName || customerData.customerId}`);
            customers.push(customerData);
          } else {
            console.log(`  ⊘ Row ${i + 1}: Skipped (no customer data or empty row)`);
          }
        } catch (error) {
          console.log(`  ✗ Row ${i + 1}: Error - ${error.message}`);
        }
      }

      console.log(`   Page ${pageCount + 1} complete: ${customers.length} total customers collected so far`);

      if (fetchAll || customers.length < limit) {
        console.log('   Checking for next page...');
        hasNextPage = await this.navigator.goToNextPage();
        if (hasNextPage) {
          pageCount++;
          console.log(`   ✓ Moving to page ${pageCount + 1}`);
        } else {
          console.log(`   ✓ No more pages - completed after ${pageCount + 1} page(s)`);
        }
      } else {
        hasNextPage = false;
        console.log('   ✓ Reached desired limit, stopping pagination');
      }
    }

    console.log(`\n✅ Pagination complete:`);
    console.log(`   - Total pages processed: ${pageCount + 1}`);
    console.log(`   - Total customers fetched: ${customers.length}`);

    if (customers.length === 0) {
      console.log(`   ℹ️  Note: 0 customers found - this is normal if there are no customers currently`);
    }

    return customers;
  }

  async extractCustomerListData(row) {
    try {
      // Extract basic data from customer list view
      // Based on actual table structure observed in RouteStar
      const customerName = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);

      if (!customerName) {
        return null;
      }

      // Extract customerId from the link in the first column (if exists)
      const customerLink = await row.$eval('td:nth-of-type(1) a', el => el.href).catch(() => null);
      let customerId = customerName; // Default to name if no ID found
      if (customerLink) {
        const match = customerLink.match(/customerdetail\/([^/]+)$/);
        if (match) {
          customerId = match[1];
        }
      }

      const serviceAddress1 = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
      const serviceCity = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);
      const serviceState = await row.$eval('td:nth-of-type(4)', el => el.textContent.trim()).catch(() => null);
      const serviceZip = await row.$eval('td:nth-of-type(5)', el => el.textContent.trim()).catch(() => null);
      const phone = await row.$eval('td:nth-of-type(6)', el => el.textContent.trim()).catch(() => null);
      const email = await row.$eval('td:nth-of-type(7)', el => el.textContent.trim()).catch(() => null);
      const contact = await row.$eval('td:nth-of-type(8)', el => el.textContent.trim()).catch(() => null);
      const accountNumber = await row.$eval('td:nth-of-type(9)', el => el.textContent.trim()).catch(() => null);
      const balance = await row.$eval('td:nth-of-type(10)', el => el.textContent.replace(/[$,]/g, '').trim()).catch(() => null);
      const customerType = await row.$eval('td:nth-of-type(11)', el => el.textContent.trim()).catch(() => null);
      const salesRep = await row.$eval('td:nth-of-type(12)', el => el.textContent.trim()).catch(() => null);
      const status = await row.$eval('td:nth-of-type(13)', el => el.textContent.trim()).catch(() => null);
      const onRoute = await row.$eval('td:nth-of-type(14)', el => el.textContent.trim()).catch(() => null);
      const lastServiceDate = await row.$eval('td:nth-of-type(15)', el => el.textContent.trim()).catch(() => null);
      const zone = await row.$eval('td:nth-of-type(16)', el => el.textContent.trim()).catch(() => null);

      return {
        customerId,
        customerName,
        contact,
        email,
        phone,
        serviceAddress1,
        serviceCity,
        serviceState,
        serviceZip,
        accountNumber,
        balance: balance ? parseFloat(balance) : null,
        customerType,
        salesRep,
        status,
        onRoute,
        lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : null,
        zone,
        detailUrl: `${this.baseUrl}/web/customerdetail/${customerId}`
      };
    } catch (error) {
      console.log(`    Error extracting customer list data: ${error.message}`);
      return null;
    }
  }

  async fetchCustomerDetails(customerId) {
    console.log(`\n📥 Fetching details for customer: ${customerId}`);

    await this.navigator.navigateToCustomerDetail(customerId);
    await this.page.waitForTimeout(3000);

    const details = {
      customerId,
      basicInfo: await this.extractBasicInfo(),
      billingAddress: await this.extractBillingAddress(),
      serviceAddress: await this.extractServiceAddress(),
      accountInfo: await this.extractAccountInfo(),
      taxAndPayment: await this.extractTaxAndPayment(),
      classification: await this.extractClassification(),
      settings: await this.extractSettings(),
      additionalInfo: await this.extractAdditionalInfo(),
      contacts: await this.extractAdditionalContacts(),
      equipment: await this.extractEquipment(),
      routes: await this.extractRoutes(),
      notes: await this.extractNotes(),
      activities: await this.extractActivities(),
      attachments: await this.extractAttachments(),
      pricing: await this.extractPricing(),
      billingInfo: await this.extractBillingInfo()
    };

    console.log(`✓ Successfully fetched details for customer: ${customerId}`);
    return details;
  }

  async extractBasicInfo() {
    try {
      console.log(`    📋 Extracting Basic Info...`);
      const customerName = await this.page.$eval('#txt_custjob', el => el.value).catch(() => null);
      const company = await this.page.$eval('#txt_company', el => el.value).catch(() => null);
      const contact = await this.page.$eval('#txt_contact', el => el.value).catch(() => null);
      const firstName = await this.page.$eval('#txt_fname', el => el.value).catch(() => null);
      const lastName = await this.page.$eval('#txt_lname', el => el.value).catch(() => null);
      const email = await this.page.$eval('#txt_email', el => el.value).catch(() => null);
      const ccEmail = await this.page.$eval('#txt_ccemail', el => el.value).catch(() => null);
      const phone = await this.page.$eval('#txt_phone', el => el.value).catch(() => null);
      const altPhone = await this.page.$eval('#txt_altphone', el => el.value).catch(() => null);
      const mobilePhone = await this.page.$eval('#txt_mobilephone', el => el.value).catch(() => null);

      console.log(`      ✓ Customer Name: ${customerName || '(empty)'}`);
      console.log(`      ✓ Company: ${company || '(empty)'}`);
      console.log(`      ✓ Contact: ${contact || '(empty)'}`);
      console.log(`      ✓ First Name: ${firstName || '(empty)'}`);
      console.log(`      ✓ Last Name: ${lastName || '(empty)'}`);
      console.log(`      ✓ Email: ${email || '(empty)'}`);
      console.log(`      ✓ CC Email: ${ccEmail || '(empty)'}`);
      console.log(`      ✓ Phone: ${phone || '(empty)'}`);
      console.log(`      ✓ Alt Phone: ${altPhone || '(empty)'}`);
      console.log(`      ✓ Mobile Phone: ${mobilePhone || '(empty)'}`);

      return {
        customerName,
        company,
        contact,
        firstName,
        lastName,
        email,
        ccEmail,
        phone,
        altPhone,
        mobilePhone
      };
    } catch (error) {
      console.log(`  Warning: Could not extract basic info - ${error.message}`);
      return {};
    }
  }

  async extractBillingAddress() {
    try {
      console.log(`    🏢 Extracting Billing Address...`);
      const billingAddress1 = await this.page.$eval('#txt_baddress1', el => el.value).catch(() => null);
      const billingAddress2 = await this.page.$eval('#txt_baddress2', el => el.value).catch(() => null);
      const billingAddress3 = await this.page.$eval('#txt_baddress3', el => el.value).catch(() => null);
      const billingCity = await this.page.$eval('#txt_bcity', el => el.value).catch(() => null);
      const billingState = await this.page.$eval('#txt_bstate', el => el.value).catch(() => null);
      const billingZip = await this.page.$eval('#txt_bzip', el => el.value).catch(() => null);

      console.log(`      ✓ Billing Address 1: ${billingAddress1 || '(empty)'}`);
      console.log(`      ✓ Billing Address 2: ${billingAddress2 || '(empty)'}`);
      console.log(`      ✓ Billing Address 3: ${billingAddress3 || '(empty)'}`);
      console.log(`      ✓ Billing City: ${billingCity || '(empty)'}`);
      console.log(`      ✓ Billing State: ${billingState || '(empty)'}`);
      console.log(`      ✓ Billing Zip: ${billingZip || '(empty)'}`);

      return {
        billingAddress1,
        billingAddress2,
        billingAddress3,
        billingCity,
        billingState,
        billingZip
      };
    } catch (error) {
      console.log(`  Warning: Could not extract billing address - ${error.message}`);
      return {};
    }
  }

  async extractServiceAddress() {
    try {
      console.log(`    📍 Extracting Service Address with Lat/Long...`);
      const serviceAddress1 = await this.page.$eval('#txt_address1', el => el.value).catch(() => null);
      const serviceAddress2 = await this.page.$eval('#txt_address2', el => el.value).catch(() => null);
      const serviceAddress3 = await this.page.$eval('#txt_address3', el => el.value).catch(() => null);
      const serviceCity = await this.page.$eval('#txt_city', el => el.value).catch(() => null);
      const serviceState = await this.page.$eval('#txt_state', el => el.value).catch(() => null);
      const serviceZip = await this.page.$eval('#txt_zip', el => el.value).catch(() => null);
      const latitude = await this.page.$eval('#txt_shiplat', el => el.value).catch(() => null);
      const longitude = await this.page.$eval('#txt_shiplng', el => el.value).catch(() => null);
      const zone = await this.page.$eval('#txt_zone', el => el.value).catch(() => null);

      console.log(`      ✓ Service Address 1: ${serviceAddress1 || '(empty)'}`);
      console.log(`      ✓ Service Address 2: ${serviceAddress2 || '(empty)'}`);
      console.log(`      ✓ Service Address 3: ${serviceAddress3 || '(empty)'}`);
      console.log(`      ✓ Service City: ${serviceCity || '(empty)'}`);
      console.log(`      ✓ Service State: ${serviceState || '(empty)'}`);
      console.log(`      ✓ Service Zip: ${serviceZip || '(empty)'}`);
      console.log(`      ✓ LATITUDE: ${latitude || '(empty)'} 🌐`);
      console.log(`      ✓ LONGITUDE: ${longitude || '(empty)'} 🌐`);
      console.log(`      ✓ Zone: ${zone || '(empty)'}`);

      return {
        serviceAddress1,
        serviceAddress2,
        serviceAddress3,
        serviceCity,
        serviceState,
        serviceZip,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        zone
      };
    } catch (error) {
      console.log(`  Warning: Could not extract service address - ${error.message}`);
      return {};
    }
  }

  async extractAccountInfo() {
    try {
      console.log(`    💰 Extracting Account Info...`);
      const accountNumber = await this.page.$eval('#ctxt_accountnum', el => el.value).catch(() => null);
      const balance = await this.page.$eval('#ctxt_balance', el => el.value.replace(/[$,]/g, '')).catch(() => null);
      const creditLimit = await this.page.$eval('#ctxt_creditlimit', el => el.value.replace(/[$,]/g, '')).catch(() => null);
      const accountValue = await this.page.$eval('#ctxt_accountvalue', el => el.value.replace(/[$,]/g, '')).catch(() => null);

      console.log(`      ✓ Account Number: ${accountNumber || '(empty)'}`);
      console.log(`      ✓ Balance: ${balance || '(empty)'}`);
      console.log(`      ✓ Credit Limit: ${creditLimit || '(empty)'}`);
      console.log(`      ✓ Account Value: ${accountValue || '(empty)'}`);

      return {
        accountNumber,
        balance: balance ? parseFloat(balance) : null,
        creditLimit: creditLimit ? parseFloat(creditLimit) : null,
        accountValue: accountValue ? parseFloat(accountValue) : null
      };
    } catch (error) {
      console.log(`  Warning: Could not extract account info - ${error.message}`);
      return {};
    }
  }

  async extractTaxAndPayment() {
    try {
      console.log(`    💵 Extracting Tax & Payment Info...`);
      const taxCode = await this.page.$eval('#ctxt_taxcode', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const taxRate = await this.page.$eval('#ctxt_taxrate', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const terms = await this.page.$eval('#ctxt_terms', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const preferredPaymentMethod = await this.page.$eval('#txt_payment_methods', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);

      console.log(`      ✓ Tax Code: ${taxCode || '(empty)'}`);
      console.log(`      ✓ Tax Rate: ${taxRate || '(empty)'}`);
      console.log(`      ✓ Terms: ${terms || '(empty)'}`);
      console.log(`      ✓ Preferred Payment Method: ${preferredPaymentMethod || '(empty)'}`);

      return {
        taxCode,
        taxRate,
        terms,
        preferredPaymentMethod
      };
    } catch (error) {
      console.log(`  Warning: Could not extract tax and payment info - ${error.message}`);
      return {};
    }
  }

  async extractClassification() {
    try {
      console.log(`    🏷️  Extracting Classification...`);
      const customerType = await this.page.$eval('#ctxt_type', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const salesRep = await this.page.$eval('#ctxt_salesrep', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const grouping = await this.page.$eval('#ctxt_group', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const priceLevel = await this.page.$eval('#ctxt_pricelevel', el => el.value).catch(() => null);
      const priceGrouping = await this.page.$eval('#txt_pricing_grouping', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const status = await this.page.$eval('#txt_status', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);

      console.log(`      ✓ Customer Type: ${customerType || '(empty)'}`);
      console.log(`      ✓ Sales Rep: ${salesRep || '(empty)'}`);
      console.log(`      ✓ Grouping: ${grouping || '(empty)'}`);
      console.log(`      ✓ Price Level: ${priceLevel || '(empty)'}`);
      console.log(`      ✓ Price Grouping: ${priceGrouping || '(empty)'}`);
      console.log(`      ✓ Status: ${status || '(empty)'}`);

      return {
        customerType,
        salesRep,
        grouping,
        priceLevel,
        priceGrouping,
        status
      };
    } catch (error) {
      console.log(`  Warning: Could not extract classification - ${error.message}`);
      return {};
    }
  }

  async extractSettings() {
    try {
      console.log(`    ⚙️  Extracting Settings...`);
      // Active checkbox - need to find the actual checkbox (might not be visible in provided HTML)
      const active = await this.page.$eval('input[type="checkbox"][name*="active"]', el => el.checked).catch(() => true); // Default to true if not found

      const paperless = await this.page.$eval('#txt_paperless', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption && selectedOption.value === '1';
      }).catch(() => false);

      const proofOfService = await this.page.$eval('#txt_proof_of_service', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption && selectedOption.value === '1';
      }).catch(() => false);

      const hideMobileEmailOption = await this.page.$eval('#txt_hide_mobile_email', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption && selectedOption.value === '1';
      }).catch(() => false);

      const addChargeOnBatchBilling = await this.page.$eval('#txt_add_charge', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption && selectedOption.value === '1';
      }).catch(() => false);

      console.log(`      ✓ Active: ${active}`);
      console.log(`      ✓ Paperless: ${paperless}`);
      console.log(`      ✓ Proof of Service: ${proofOfService}`);
      console.log(`      ✓ Hide Mobile Email: ${hideMobileEmailOption}`);
      console.log(`      ✓ Add Charge on Batch Billing: ${addChargeOnBatchBilling}`);

      return {
        active,
        paperless,
        proofOfService,
        hideMobileEmailOption,
        addChargeOnBatchBilling
      };
    } catch (error) {
      console.log(`  Warning: Could not extract settings - ${error.message}`);
      return {};
    }
  }

  async extractAdditionalInfo() {
    try {
      console.log(`    📝 Extracting Additional Info & Custom Fields...`);
      const notificationMethod = await this.page.$eval('#txt_notification_method', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const parentCustomer = await this.page.$eval('#txt_parentname', el => el.value).catch(() => null);
      const billAnotherCustomer = await this.page.$eval('#txt_billingparent', el => {
        const selectedOption = el.options[el.selectedIndex];
        return selectedOption ? selectedOption.textContent.trim() : null;
      }).catch(() => null);
      const customerPopupMessage = await this.page.$eval('#customer_popup_message', el => el.value).catch(() => null);
      const hoaCode = await this.page.$eval('#txt_hoa_code', el => el.value).catch(() => null);
      const onRoute = await this.page.$eval('#CustomField7', el => el.textContent.trim()).catch(() => null);
      const routeMaintPlan = await this.page.$eval('#CustomField7', el => el.textContent.trim()).catch(() => null);
      const defaultDeliveryMethod = await this.page.$eval('#CustomField8', el => el.textContent.trim()).catch(() => null);
      const mapBook = await this.page.$eval('#CustomField9', el => el.textContent.trim()).catch(() => null);
      const mapPage = await this.page.$eval('#CustomField10', el => el.textContent.trim()).catch(() => null);
      const blanketPONumber = await this.page.$eval('#CustomField11', el => el.textContent.trim()).catch(() => null);
      const taxKeyNo = await this.page.$eval('#CustomField12', el => el.textContent.trim()).catch(() => null);
      const permitNumber = await this.page.$eval('#CustomField13', el => el.textContent.trim()).catch(() => null);
      const county = await this.page.$eval('#CustomField14', el => el.textContent.trim()).catch(() => null);
      const commission = await this.page.$eval('#CustomField15', el => el.textContent.trim()).catch(() => null);
      const systemType = await this.page.$eval('#CustomField16', el => el.textContent.trim()).catch(() => null);
      const lastServiceDate = await this.page.$eval('#CustomField17', el => el.textContent.trim()).catch(() => null);
      const drivingDirections = await this.page.$eval('#CustomField18', el => el.textContent.trim()).catch(() => null);

      console.log(`      ✓ Notification Method: ${notificationMethod || '(empty)'}`);
      console.log(`      ✓ Parent Customer: ${parentCustomer || '(empty)'}`);
      console.log(`      ✓ Bill Another Customer: ${billAnotherCustomer || '(empty)'}`);
      console.log(`      ✓ Customer Popup Message: ${customerPopupMessage ? '(set)' : '(empty)'}`);
      console.log(`      ✓ HOA Code: ${hoaCode || '(empty)'}`);
      console.log(`      ✓ On Route: ${onRoute || '(empty)'}`);
      console.log(`      ✓ Route Maint Plan: ${routeMaintPlan || '(empty)'}`);
      console.log(`      ✓ Default Delivery Method: ${defaultDeliveryMethod || '(empty)'}`);
      console.log(`      ✓ Map Book: ${mapBook || '(empty)'}`);
      console.log(`      ✓ Map Page: ${mapPage || '(empty)'}`);
      console.log(`      ✓ Blanket PO Number: ${blanketPONumber || '(empty)'}`);
      console.log(`      ✓ Tax Key No: ${taxKeyNo || '(empty)'}`);
      console.log(`      ✓ Permit Number: ${permitNumber || '(empty)'}`);
      console.log(`      ✓ County: ${county || '(empty)'}`);
      console.log(`      ✓ Commission: ${commission || '(empty)'}`);
      console.log(`      ✓ System Type: ${systemType || '(empty)'}`);
      console.log(`      ✓ Last Service Date: ${lastServiceDate || '(empty)'}`);
      console.log(`      ✓ Driving Directions: ${drivingDirections ? '(set)' : '(empty)'}`);

      // Parse lastServiceDate properly - only convert to Date if it's a valid date string
      let parsedLastServiceDate = null;
      if (lastServiceDate && lastServiceDate !== 'Empty' && lastServiceDate.trim() !== '') {
        const dateObj = new Date(lastServiceDate);
        if (!isNaN(dateObj.getTime())) {
          parsedLastServiceDate = dateObj;
        }
      }

      return {
        notificationMethod,
        parentCustomer,
        billAnotherCustomer,
        customerPopupMessage,
        hoaCode,
        onRoute,
        routeMaintPlan,
        defaultDeliveryMethod,
        mapBook,
        mapPage,
        blanketPONumber,
        taxKeyNo,
        permitNumber,
        county,
        commission,
        systemType,
        lastServiceDate: parsedLastServiceDate,
        drivingDirections
      };
    } catch (error) {
      console.log(`  Warning: Could not extract additional info - ${error.message}`);
      return {};
    }
  }

  async extractAdditionalContacts() {
    try {
      console.log(`    👥 Extracting Additional Contacts...`);
      // Click Additional Contacts tab if needed
      const contactsTab = await this.page.$('a[href="#additional-contacts"]');
      if (contactsTab) {
        await contactsTab.click();
        await this.page.waitForTimeout(1000);
      }

      const contacts = [];
      const contactRows = await this.page.$$('#additional-contacts table tbody tr');

      for (const row of contactRows) {
        const contactName = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const notifyBy = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const email = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);
        const phone = await row.$eval('td:nth-of-type(4)', el => el.textContent.trim()).catch(() => null);

        if (contactName) {
          contacts.push({ contactName, notifyBy, email, phone });
        }
      }

      console.log(`      ✓ Found ${contacts.length} additional contact(s)`);

      return contacts;
    } catch (error) {
      console.log(`  Warning: Could not extract additional contacts - ${error.message}`);
      return [];
    }
  }

  async extractEquipment() {
    try {
      console.log(`    🔧 Extracting Equipment...`);
      // Click Equipment tab if needed
      const equipmentTab = await this.page.$('a[href="#equipment"]');
      if (equipmentTab) {
        await equipmentTab.click();
        await this.page.waitForTimeout(1000);
      }

      const equipment = [];
      const equipmentRows = await this.page.$$('#equipment table tbody tr');

      for (const row of equipmentRows) {
        const equipmentType = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const description = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const serialNumber = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);

        if (equipmentType) {
          equipment.push({ equipmentType, description, serialNumber });
        }
      }

      console.log(`      ✓ Found ${equipment.length} equipment item(s)`);

      return equipment;
    } catch (error) {
      console.log(`  Warning: Could not extract equipment - ${error.message}`);
      return [];
    }
  }

  async extractRoutes() {
    try {
      console.log(`    🚚 Extracting Routes...`);
      // Click Routes tab if needed
      const routesTab = await this.page.$('a[href="#routes"]');
      if (routesTab) {
        await routesTab.click();
        await this.page.waitForTimeout(1000);
      }

      const routes = [];
      const routeRows = await this.page.$$('#routes table tbody tr');

      for (const row of routeRows) {
        const routeName = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const frequency = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const status = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);

        if (routeName) {
          routes.push({ routeName, frequency, status });
        }
      }

      console.log(`      ✓ Found ${routes.length} route(s)`);

      return routes;
    } catch (error) {
      console.log(`  Warning: Could not extract routes - ${error.message}`);
      return [];
    }
  }

  async extractNotes() {
    try {
      console.log(`    📌 Extracting Notes...`);
      // Click Notes tab if needed
      const notesTab = await this.page.$('a[href="#notes"]');
      if (notesTab) {
        await notesTab.click();
        await this.page.waitForTimeout(1000);
      }

      const notes = [];
      const noteRows = await this.page.$$('#notes table tbody tr');

      for (const row of noteRows) {
        const noteText = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const createdBy = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const createdDate = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);

        if (noteText) {
          notes.push({ noteText, createdBy, createdDate });
        }
      }

      console.log(`      ✓ Found ${notes.length} note(s)`);

      return notes;
    } catch (error) {
      console.log(`  Warning: Could not extract notes - ${error.message}`);
      return [];
    }
  }

  async extractActivities() {
    try {
      console.log(`    📊 Extracting Activities...`);
      // Click Activity tab if needed
      const activityTab = await this.page.$('a[href="#activity"]');
      if (activityTab) {
        await activityTab.click();
        await this.page.waitForTimeout(1000);
      }

      const activities = [];
      const activityRows = await this.page.$$('#activity table tbody tr');

      for (const row of activityRows) {
        const activityDate = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const activityType = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const description = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);
        const amount = await row.$eval('td:nth-of-type(4)', el => el.textContent.replace(/[$,]/g, '').trim()).catch(() => null);

        if (activityDate) {
          activities.push({
            activityDate,
            activityType,
            description,
            amount: amount ? parseFloat(amount) : null
          });
        }
      }

      console.log(`      ✓ Found ${activities.length} activit(y/ies)`);

      return activities;
    } catch (error) {
      console.log(`  Warning: Could not extract activities - ${error.message}`);
      return [];
    }
  }

  async extractAttachments() {
    try {
      console.log(`    📎 Extracting Attachments...`);
      // Click Attachments tab if needed
      const attachmentsTab = await this.page.$('a[href="#attachments"]');
      if (attachmentsTab) {
        await attachmentsTab.click();
        await this.page.waitForTimeout(1000);
      }

      const attachments = [];
      const attachmentRows = await this.page.$$('#attachments table tbody tr');

      for (const row of attachmentRows) {
        const fileName = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const uploadedDate = await row.$eval('td:nth-of-type(2)', el => el.textContent.trim()).catch(() => null);
        const fileUrl = await row.$eval('td:nth-of-type(1) a', el => el.href).catch(() => null);

        if (fileName) {
          attachments.push({ fileName, uploadedDate, fileUrl });
        }
      }

      console.log(`      ✓ Found ${attachments.length} attachment(s)`);

      return attachments;
    } catch (error) {
      console.log(`  Warning: Could not extract attachments - ${error.message}`);
      return [];
    }
  }

  async extractPricing() {
    try {
      console.log(`    💲 Extracting Pricing...`);
      // Click Pricing tab if needed
      const pricingTab = await this.page.$('a[href="#pricing"]');
      if (pricingTab) {
        await pricingTab.click();
        await this.page.waitForTimeout(1000);
      }

      const pricing = [];
      const pricingRows = await this.page.$$('#pricing table tbody tr');

      for (const row of pricingRows) {
        const itemName = await row.$eval('td:nth-of-type(1)', el => el.textContent.trim()).catch(() => null);
        const unitPrice = await row.$eval('td:nth-of-type(2)', el => el.textContent.replace(/[$,]/g, '').trim()).catch(() => null);
        const discount = await row.$eval('td:nth-of-type(3)', el => el.textContent.trim()).catch(() => null);

        if (itemName) {
          pricing.push({
            itemName,
            unitPrice: unitPrice ? parseFloat(unitPrice) : null,
            discount
          });
        }
      }

      console.log(`      ✓ Found ${pricing.length} pricing item(s)`);

      return pricing;
    } catch (error) {
      console.log(`  Warning: Could not extract pricing - ${error.message}`);
      return [];
    }
  }

  async extractBillingInfo() {
    try {
      console.log(`    🧾 Extracting Billing Info...`);
      // Click Billing Info tab if needed
      const billingTab = await this.page.$('a[href="#billing-info"]');
      if (billingTab) {
        await billingTab.click();
        await this.page.waitForTimeout(1000);
      }

      const billingFrequency = await this.page.$eval('#billing_frequency', el => el.value).catch(() => null);
      const billingMethod = await this.page.$eval('#billing_method', el => el.value).catch(() => null);
      const invoiceDelivery = await this.page.$eval('#invoice_delivery', el => el.value).catch(() => null);
      const paymentTerms = await this.page.$eval('#payment_terms', el => el.value).catch(() => null);
      const autoPay = await this.page.$eval('#auto_pay', el => el.checked).catch(() => null);

      console.log(`      ✓ Billing Frequency: ${billingFrequency || '(empty)'}`);
      console.log(`      ✓ Billing Method: ${billingMethod || '(empty)'}`);
      console.log(`      ✓ Invoice Delivery: ${invoiceDelivery || '(empty)'}`);
      console.log(`      ✓ Payment Terms: ${paymentTerms || '(empty)'}`);
      console.log(`      ✓ Auto Pay: ${autoPay || '(empty)'}`);

      return {
        billingFrequency,
        billingMethod,
        invoiceDelivery,
        paymentTerms,
        autoPay
      };
    } catch (error) {
      console.log(`  Warning: Could not extract billing info - ${error.message}`);
      return {};
    }
  }
}

module.exports = RouteStarCustomerFetcher;
