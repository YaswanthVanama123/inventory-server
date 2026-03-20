const axios = require('axios');
const GoAuditsLocation = require('../models/GoAuditsLocation');
const goAuditsBrowserService = require('./goAuditsBrowser.service');

class GoAuditsService {
  constructor() {
    this.baseUrl = process.env.GOAUDITS_API_BASE_URL;
    this.email = process.env.GOAUDITS_EMAIL;
    this.password = process.env.GOAUDITS_PASSWORD;
    this.token = null;
    this.tokenExpiry = null;
    this.companyId = null;
    this.syncInProgress = false;
    this.syncLock = null;
  }

  /**
   * Authenticate with GoAudits API and get access token
   */
  async authenticate() {
    try {
      console.log('🔐 Authenticating with GoAudits API...');
      console.log(`   URL: ${this.baseUrl}/v1/api/auth/authenticate`);
      console.log(`   Email: ${this.email}`);

      const response = await axios.post(`${this.baseUrl}/v1/api/auth/authenticate`, {
        user_name: this.email,
        usr_pwd: this.password
      });

      console.log('Response received:', JSON.stringify(response.data, null, 2));

      if (response.data && response.data.authToken) {
        this.token = response.data.authToken;
        this.companyId = response.data.guid || response.data.client_id;
        this.userName = response.data.user_name;

        // Set token expiry to 23 hours from now (tokens usually last 24 hours)
        this.tokenExpiry = Date.now() + (23 * 60 * 60 * 1000);

        console.log('✓ Authentication successful');
        console.log(`✓ User: ${response.data.fullname || response.data.user_name}`);
        console.log(`✓ Company: ${response.data.client_name}`);
        console.log(`✓ Token: ${this.token.substring(0, 20)}...`);

        return true;
      } else {
        throw new Error('No auth token received from GoAudits API');
      }
    } catch (error) {
      console.error('✗ Authentication failed:', error.response?.data || error.message);
      console.error('✗ Status:', error.response?.status);
      console.error('✗ Full error:', error.message);
      throw new Error(`GoAudits authentication failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Ensure we have a valid token
   */
  async ensureAuthenticated() {
    if (!this.token || !this.tokenExpiry || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Get authenticated axios instance
   */
  async getAxiosInstance() {
    await this.ensureAuthenticated();

    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get all locations from GoAudits
   */
  async getLocations(params = {}) {
    try {
      console.log('📍 Fetching locations from GoAudits...');

      await this.ensureAuthenticated();

      const api = axios.create({
        baseURL: this.baseUrl,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': '*/*'
        }
      });

      // GoAudits API uses POST for locations with getlocations endpoint
      const payload = {
        user_name: this.userName || this.email,
        active: params.active !== undefined ? params.active : '', // Empty string for all
        client_id: this.companyId, // Add company ID to get all locations for this company
        ...params
      };

      console.log('   Request payload:', JSON.stringify(payload, null, 2));

      const response = await api.post('/v1/audits/getlocations', payload);

      console.log('   Response status:', response.status);
      console.log('   Response data:', JSON.stringify(response.data, null, 2));

      // GoAudits returns: { success: true, data: [...], count: N }
      let locations = [];

      if (response.data && response.data.data) {
        locations = response.data.data;
      } else if (Array.isArray(response.data)) {
        locations = response.data;
      } else {
        locations = [];
      }

      console.log(`✓ Fetched ${locations.length} locations from GoAudits`);

      return locations;
    } catch (error) {
      console.error('✗ Failed to fetch locations:', error.response?.data || error.message);
      console.error('   Status:', error.response?.status);
      console.error('   URL:', error.config?.url);
      throw new Error(`Failed to fetch GoAudits locations: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get a specific location by ID
   */
  async getLocationById(locationId) {
    try {
      const api = await this.getAxiosInstance();
      const response = await api.get(`/locations/${locationId}`);

      return response.data?.data || response.data;
    } catch (error) {
      console.error(`✗ Failed to fetch location ${locationId}:`, error.response?.data || error.message);
      throw new Error(`Failed to fetch GoAudits location: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Create a new location in GoAudits using browser automation
   */
  async createLocation(locationData) {
    try {
      console.log(`📍 Creating location in GoAudits via browser automation: ${locationData.store_name}...`);

      // Prepare location data according to GoAudits web form format
      const payload = {
        selected_clientid: locationData.selected_clientid || this.companyId,
        store_name: locationData.store_name,
        location_code: locationData.location_code || '',
        time_zone: locationData.time_zone || 'GMT +00:00',
        address: locationData.address || '',
        postcode: locationData.postcode || '',
        latitude: locationData.latitude || '',
        longitude: locationData.longitude || '',
        toemail: locationData.toemail || '',
        ccemail: locationData.ccemail || '',
        bccemail: locationData.bccemail || ''
      };

      // Use browser automation to create location
      const result = await goAuditsBrowserService.createLocation(payload);

      console.log(`✓ Location created successfully: ${payload.store_name}`);

      return {
        success: true,
        store_name: payload.store_name,
        locationName: payload.store_name
      };
    } catch (error) {
      console.error(`✗ Failed to create location ${locationData.store_name}:`, error.message);
      throw new Error(`Failed to create GoAudits location: ${error.message}`);
    }
  }

  /**
   * Update a location in GoAudits
   */
  async updateLocation(locationId, locationData) {
    try {
      console.log(`📍 Updating location in GoAudits: ${locationId}...`);

      const api = await this.getAxiosInstance();
      const response = await api.put(`/locations/${locationId}`, locationData);

      console.log(`✓ Location updated successfully`);
      return response.data?.data || response.data;
    } catch (error) {
      console.error(`✗ Failed to update location ${locationId}:`, error.response?.data || error.message);
      throw new Error(`Failed to update GoAudits location: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Delete a location from GoAudits
   */
  async deleteLocation(locationId) {
    try {
      console.log(`📍 Deleting location from GoAudits: ${locationId}...`);

      const api = await this.getAxiosInstance();
      await api.delete(`/locations/${locationId}`);

      console.log(`✓ Location deleted successfully`);
      return true;
    } catch (error) {
      console.error(`✗ Failed to delete location ${locationId}:`, error.response?.data || error.message);
      throw new Error(`Failed to delete GoAudits location: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Sync RouteStarCustomer to GoAudits location
   */
  async syncCustomerToLocation(customer) {
    try {
      // Check if customer already exists in our GoAuditsLocation mapping
      let goAuditsLocation = await GoAuditsLocation.findOne({
        routeStarCustomerId: customer.customerId
      });

      if (goAuditsLocation) {
        console.log(`↻ Customer ${customer.customerName} already synced to GoAudits (Location ID: ${goAuditsLocation.locationId})`);
        return {
          success: true,
          action: 'already_exists',
          locationId: goAuditsLocation.locationId,
          message: 'Customer already synced to GoAudits'
        };
      }

      // Check if location with same name exists in GoAudits
      const existingLocations = await this.getLocations({ active: '' });
      const existingLocation = existingLocations.find(loc =>
        (loc.store_name || loc.storename || loc.location || loc.Location) === customer.customerName
      );

      if (existingLocation) {
        // Location exists, just create our mapping
        goAuditsLocation = await GoAuditsLocation.create({
          locationId: existingLocation.guid || existingLocation.store_id || existingLocation.id,
          routeStarCustomerId: customer.customerId,
          routeStarCustomerName: customer.customerName,
          locationName: customer.customerName,
          companyId: existingLocation.client_id || existingLocation.clientid,
          companyName: existingLocation.client_name || existingLocation.clientname,
          address: existingLocation.address,
          postcode: existingLocation.postcode,
          latitude: parseFloat(existingLocation.latitude) || null,
          longitude: parseFloat(existingLocation.longitude) || null,
          timeZone: existingLocation.time_zone || existingLocation.timezone,
          toEmail: existingLocation.toemail,
          ccEmail: existingLocation.ccemail,
          bccEmail: existingLocation.bccemail,
          createdInGoAudits: false,
          syncStatus: 'synced'
        });

        console.log(`✓ Mapped existing GoAudits location to customer ${customer.customerName}`);
        return {
          success: true,
          action: 'mapped_existing',
          locationId: goAuditsLocation.locationId,
          message: 'Mapped to existing GoAudits location'
        };
      }

      // Create new location in GoAudits
      const locationData = {
        store_name: customer.customerName,
        location_code: customer.customerId || '',
        address: this.formatAddress(customer),
        postcode: customer.serviceZip || customer.billingZip || '',
        latitude: customer.latitude ? String(customer.latitude) : '',
        longitude: customer.longitude ? String(customer.longitude) : '',
        time_zone: 'GMT -05:00', // Eastern Time for Virginia
        toemail: customer.email || '',
        ccemail: '',
        bccemail: ''
      };

      const createdLocation = await this.createLocation(locationData);

      // After creating, try to find the newly created location in GoAudits to get its real ID
      let realLocationId = null;
      try {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for GoAudits to save
        const allLocations = await this.getLocations({ active: '' });
        const foundLocation = allLocations.find(loc =>
          (loc.store_name || loc.storename || loc.location) === customer.customerName
        );
        if (foundLocation) {
          realLocationId = foundLocation.guid || foundLocation.store_id || foundLocation.id;
          console.log(`   ✓ Found newly created location ID: ${realLocationId}`);
        }
      } catch (error) {
        console.log(`   Could not fetch real location ID, using temporary ID`);
      }

      // Use real ID if found, otherwise use temporary ID with random component
      const locationId = realLocationId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Save to our database
      goAuditsLocation = await GoAuditsLocation.create({
        locationId: locationId,
        routeStarCustomerId: customer.customerId,
        routeStarCustomerName: customer.customerName,
        locationName: customer.customerName,
        companyId: createdLocation.client_id || createdLocation.clientid || this.companyId,
        companyName: createdLocation.client_name || createdLocation.clientname,
        address: locationData.address,
        postcode: locationData.postcode,
        latitude: customer.latitude,
        longitude: customer.longitude,
        timeZone: locationData.time_zone,
        toEmail: locationData.toemail,
        ccEmail: locationData.ccemail,
        bccEmail: locationData.bccemail,
        createdInGoAudits: true,
        syncStatus: 'synced'
      });

      console.log(`✓ Created new GoAudits location for customer ${customer.customerName}`);
      return {
        success: true,
        action: 'created',
        locationId: goAuditsLocation.locationId,
        message: 'Created new location in GoAudits'
      };

    } catch (error) {
      console.error(`✗ Failed to sync customer ${customer.customerName}:`, error.message);

      // Save error status
      await GoAuditsLocation.findOneAndUpdate(
        { routeStarCustomerId: customer.customerId },
        {
          routeStarCustomerId: customer.customerId,
          routeStarCustomerName: customer.customerName,
          locationName: customer.customerName,
          syncStatus: 'error',
          syncError: error.message
        },
        { upsert: true }
      );

      return {
        success: false,
        action: 'error',
        error: error.message,
        message: `Failed to sync: ${error.message}`
      };
    }
  }

  /**
   * Format customer address for GoAudits
   */
  formatAddress(customer) {
    const parts = [];

    if (customer.serviceAddress1) parts.push(customer.serviceAddress1);
    if (customer.serviceAddress2) parts.push(customer.serviceAddress2);

    const cityStateLine = [];
    if (customer.serviceCity) cityStateLine.push(customer.serviceCity);
    if (customer.serviceState) cityStateLine.push(customer.serviceState);
    if (customer.serviceZip) cityStateLine.push(customer.serviceZip);

    if (cityStateLine.length > 0) {
      parts.push(cityStateLine.join(', '));
    }

    return parts.join('\n') || '';
  }

  /**
   * Sync multiple customers to GoAudits
   */
  async syncCustomersToLocations(customers) {
    // Check if sync is already in progress
    if (this.syncInProgress) {
      const error = new Error('Sync operation already in progress. Please wait for the current sync to complete.');
      console.error('⚠️ Sync blocked - another sync is already running');
      throw error;
    }

    // Acquire sync lock
    this.syncInProgress = true;
    this.syncLock = Date.now();
    const lockId = this.syncLock;

    console.log(`\n🔄 Starting sync of ${customers.length} customers to GoAudits... (Lock ID: ${lockId})`);

    const results = {
      total: customers.length,
      created: 0,
      mapped_existing: 0,
      already_exists: 0,
      errors: 0,
      details: []
    };

    // Initialize browser once for all creations
    let browserInitialized = false;
    try {
      console.log('🌐 Initializing browser for all location creations...');
      await goAuditsBrowserService.initialize();
      browserInitialized = true;
      console.log('✓ Browser initialized successfully and ready to use');
    } catch (error) {
      console.error('✗ Failed to initialize browser:', error.message);
      this.syncInProgress = false;
      this.syncLock = null;
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }

    try {
      for (let i = 0; i < customers.length; i++) {
        const customer = customers[i];
        console.log(`\n[${i + 1}/${customers.length}] Processing customer: ${customer.customerName}`);

        try {
          const result = await this.syncCustomerToLocation(customer);
          results.details.push({
            customerId: customer.customerId,
            customerName: customer.customerName,
            ...result
          });

          if (result.success) {
            results[result.action]++;
          } else {
            results.errors++;
          }

          // Small delay between customers to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
          console.error(`✗ Error syncing customer ${customer.customerName}:`, error.message);
          results.errors++;
          results.details.push({
            customerId: customer.customerId,
            customerName: customer.customerName,
            success: false,
            action: 'error',
            error: error.message
          });
        }
      }
    } finally {
      // Cleanup browser resources
      if (browserInitialized) {
        console.log('🧹 Cleaning up browser resources...');
        await goAuditsBrowserService.cleanup();
        console.log('✓ Browser cleaned up');
      }

      // Release sync lock
      this.syncInProgress = false;
      this.syncLock = null;
      console.log(`✓ Sync lock released (Lock ID: ${lockId})`);
    }

    console.log('\n✓ Sync complete:');
    console.log(`  - Created: ${results.created}`);
    console.log(`  - Mapped existing: ${results.mapped_existing}`);
    console.log(`  - Already exists: ${results.already_exists}`);
    console.log(`  - Errors: ${results.errors}`);

    return results;
  }
}

module.exports = new GoAuditsService();
