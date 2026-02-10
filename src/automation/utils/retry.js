const logger = require('./logger');
const { wait } = require('./wait');

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} options - Retry options
 */
async function retry(fn, options = {}) {
  const {
    attempts = 3,
    delay = 2000,
    backoff = true,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;

        logger.warn(`Attempt ${attempt}/${attempts} failed, retrying in ${waitTime}ms`, {
          error: error.message
        });

        if (onRetry) {
          await onRetry(attempt, error);
        }

        await wait(waitTime);
      }
    }
  }

  logger.error(`All ${attempts} attempts failed`, {
    error: lastError.message
  });

  throw lastError;
}

module.exports = { retry };
