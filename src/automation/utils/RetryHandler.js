



class RetryHandler {
  


  static async execute(fn, options = {}) {
    const {
      maxAttempts = 3,
      delay = 1000,
      backoff = true,
      onRetry = null,
      shouldRetry = () => true
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        
        if (!shouldRetry(error) || attempt === maxAttempts) {
          throw error;
        }

        
        if (onRetry) {
          await onRetry(attempt, error);
        }

        
        const retryDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay;
        await this.sleep(retryDelay);
      }
    }

    throw lastError;
  }

  


  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RetryHandler;
