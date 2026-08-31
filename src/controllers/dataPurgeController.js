const dataPurgeService = require('../services/dataPurge.service');

// Purging a whole collection is irreversible, so the client has to say so
// explicitly. This is a deliberate guard against a stray request wiping a
// production collection.
const CONFIRM_PHRASE = 'DELETE';

const requireConfirmation = (req, res) => {
  if (req.body?.confirm !== CONFIRM_PHRASE) {
    res.status(400).json({
      success: false,
      message: `Confirmation required: send { "confirm": "${CONFIRM_PHRASE}" } to permanently delete all records`,
    });
    return false;
  }
  return true;
};

const handleError = (res, error, fallback) => {
  console.error(`[DataPurge] ${fallback}:`, error);
  const isBadRequest =
    /Unknown data type|No records selected|No valid record ids/i.test(error.message);
  res.status(isBadRequest ? 400 : 500).json({
    success: false,
    message: isBadRequest ? error.message : fallback,
    error: error.message,
  });
};

class DataPurgeController {
  async getTypes(req, res) {
    try {
      const types = await dataPurgeService.getTypeSummaries();
      res.json({
        success: true,
        data: {
          types,
          totalRecords: types.reduce((sum, type) => sum + type.count, 0),
        },
      });
    } catch (error) {
      handleError(res, error, 'Failed to load purgeable data types');
    }
  }

  async purgeSelected(req, res) {
    try {
      const result = await dataPurgeService.purgeByIds(
        req.params.type,
        req.body?.ids,
        req.user
      );
      res.json({
        success: true,
        message: `Permanently deleted ${result.deleted} record(s)`,
        data: result,
      });
    } catch (error) {
      handleError(res, error, 'Failed to delete selected records');
    }
  }

  async purgeAll(req, res) {
    try {
      if (!requireConfirmation(req, res)) return;
      const result = await dataPurgeService.purgeAll(req.params.type, req.user);
      res.json({
        success: true,
        message: `Permanently deleted all ${result.deleted} record(s)`,
        data: result,
      });
    } catch (error) {
      handleError(res, error, 'Failed to delete all records');
    }
  }

  /** One-shot cleanup: purge several whole collections in a single call. */
  async purgeManyTypes(req, res) {
    try {
      if (!requireConfirmation(req, res)) return;
      const types = req.body?.types;
      if (!Array.isArray(types) || types.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No data types selected',
        });
      }
      const results = [];
      const failed = [];
      // Sequential: cascades touch shared collections (stock movements and
      // summaries), so running them in parallel would race on the rebuild.
      for (const type of types) {
        try {
          results.push(await dataPurgeService.purgeAll(type, req.user));
        } catch (error) {
          failed.push({ type, message: error.message });
        }
      }
      const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
      res.json({
        success: failed.length === 0,
        message: `Permanently deleted ${totalDeleted} record(s) across ${results.length} data type(s)`,
        data: { results, failed, totalDeleted },
      });
    } catch (error) {
      handleError(res, error, 'Failed to purge selected data types');
    }
  }
}

module.exports = new DataPurgeController();
