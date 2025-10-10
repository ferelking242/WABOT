/**
 * Optimized API Handler for wabot
 * Implements parallel requests, retry logic, and intelligent fallbacks
 */

const { cache } = require('./cache');

class OptimizedApiHandler {
    constructor() {
        this.defaultTimeout = 10000; // 10 seconds
        this.defaultRetries = 2;
        this.defaultCacheTTL = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Delay utility for retry logic
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Make HTTP request with retry logic
     * @param {string} url - Request URL
     * @param {object} options - Request options
     * @param {number} retries - Number of retries
     * @returns {Promise<object>} Response data
     */
    async makeRequest(url, options = {}, retries = this.defaultRetries) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

        try {
            const fetch = require('node-fetch');
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                timeout: this.defaultTimeout
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (retries > 0 && error.name !== 'AbortError') {
                await this.delay(1000 * (this.defaultRetries - retries + 1)); // Progressive delay
                return this.makeRequest(url, options, retries - 1);
            }
            
            throw error;
        }
    }

    /**
     * Try multiple APIs in parallel
     * @param {Array} apiConfigs - Array of API configurations
     * @param {function} validator - Function to validate response
     * @returns {Promise<object>} First successful response
     */
    async tryApisParallel(apiConfigs, validator = null) {
        const promises = apiConfigs.map(async (config) => {
            try {
                const response = await this.makeRequest(config.url, config.options);
                
                if (validator && !validator(response)) {
                    throw new Error('Response validation failed');
                }
                
                return { success: true, data: response, source: config.name };
            } catch (error) {
                return { success: false, error: error.message, source: config.name };
            }
        });

        const results = await Promise.allSettled(promises);
        
        // Find first successful result
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.success) {
                return result.value.data;
            }
        }

        // If all failed, throw error with details
        const errors = results
            .filter(r => r.status === 'fulfilled' && !r.value.success)
            .map(r => `${r.value.source}: ${r.value.error}`)
            .join(', ');
        
        throw new Error(`All APIs failed: ${errors}`);
    }

    /**
     * Try multiple APIs sequentially (fallback)
     * @param {Array} apiConfigs - Array of API configurations
     * @param {function} validator - Function to validate response
     * @returns {Promise<object>} First successful response
     */
    async tryApisSequential(apiConfigs, validator = null) {
        for (const config of apiConfigs) {
            try {
                const response = await this.makeRequest(config.url, config.options);
                
                if (validator && !validator(response)) {
                    continue;
                }
                
                return response;
            } catch (error) {
                console.log(`API ${config.name} failed: ${error.message}`);
                continue;
            }
        }

        throw new Error('All APIs failed');
    }

    /**
     * Cached API call
     * @param {string} cacheKey - Cache key
     * @param {function} apiCall - Function that returns Promise
     * @param {number} ttl - Cache TTL
     * @returns {Promise<any>} Cached or fresh data
     */
    async cachedCall(cacheKey, apiCall, ttl = this.defaultCacheTTL) {
        return cache.cacheApiCall(cacheKey, apiCall, ttl);
    }

    /**
     * Utility delay function
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * AI API optimized handler
     * @param {string} query - User query
     * @param {string} service - AI service (gpt, gemini, claude)
     * @param {string} userLang - User language for response
     * @returns {Promise<string>} AI response
     */
    async handleAiRequest(query, service = 'auto', userLang = 'fr') {
        // Force response in user language by prepending instruction
        const languageMap = {
            'fr': 'français',
            'en': 'English', 
            'es': 'español',
            'de': 'Deutsch',
            'it': 'italiano',
            'pt': 'português'
        };
        
        const langName = languageMap[userLang] || 'français';
        const languageInstruction = `Answer in ${langName} only. Important: Your entire response must be in ${langName}. Query: `;
        const enhancedQuery = languageInstruction + query;
        
        const cacheKey = `ai_${service}_${userLang}_${this.hashString(query)}`;
        
        return this.cachedCall(cacheKey, async () => {
            const apiConfigs = this.getAiApiConfigs(enhancedQuery, service);
            
            // Try in parallel for better performance
            return this.tryApisParallel(apiConfigs, (response) => {
                // Validate that response contains actual content
                const content = response.result || response.data || response.response || response.answer;
                return content && content.length > 10;
            });
        }, 10 * 60 * 1000); // Cache AI responses for 10 minutes
    }

    /**
     * Get AI API configurations
     * @param {string} query - User query
     * @param {string} service - AI service
     * @returns {Array} API configurations
     */
    getAiApiConfigs(query, service) {
        const encodedQuery = encodeURIComponent(query);
        
        const configs = {
            gpt: [
                {
                    name: 'GPT-1',
                    url: `https://api.yanzbotz.my.id/api/ai/characterai?query=${encodedQuery}&name=gpt`,
                    options: {}
                },
                {
                    name: 'GPT-2',
                    url: `https://api.vreden.my.id/api/gpt?query=${encodedQuery}`,
                    options: {}
                },
                {
                    name: 'GPT-3',
                    url: `https://api.dreaded.site/api/gpt4?text=${encodedQuery}`,
                    options: {}
                }
            ],
            gemini: [
                {
                    name: 'Gemini-1',
                    url: `https://api.yanzbotz.my.id/api/ai/characterai?query=${encodedQuery}&name=gemini`,
                    options: {}
                },
                {
                    name: 'Gemini-2',
                    url: `https://api.vreden.my.id/api/gemini?query=${encodedQuery}`,
                    options: {}
                },
                {
                    name: 'Gemini-3',
                    url: `https://api.dreaded.site/api/gemini2?text=${encodedQuery}`,
                    options: {}
                }
            ],
            claude: [
                {
                    name: 'Claude-1',
                    url: `https://api.yanzbotz.my.id/api/ai/characterai?query=${encodedQuery}&name=claude`,
                    options: {}
                },
                {
                    name: 'Claude-2',
                    url: `https://api.dreaded.site/api/claude?text=${encodedQuery}`,
                    options: {}
                }
            ]
        };

        if (service === 'auto') {
            return [...configs.gpt, ...configs.gemini, ...configs.claude];
        }

        return configs[service] || [];
    }

    /**
     * Translation API optimized handler
     * @param {string} text - Text to translate
     * @param {string} targetLang - Target language
     * @returns {Promise<string>} Translated text
     */
    async handleTranslation(text, targetLang) {
        const cacheKey = `translate_${targetLang}_${this.hashString(text)}`;
        
        return this.cachedCall(cacheKey, async () => {
            const apiConfigs = [
                {
                    name: 'Google',
                    url: `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`,
                    options: {}
                },
                {
                    name: 'MyMemory',
                    url: `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`,
                    options: {}
                },
                {
                    name: 'Dreaded',
                    url: `https://api.dreaded.site/api/translate?text=${encodeURIComponent(text)}&lang=${targetLang}`,
                    options: {}
                }
            ];

            // Use parallel for translation APIs
            const response = await this.tryApisParallel(apiConfigs, (data) => {
                // Validate translation response
                if (data[0] && data[0][0] && data[0][0][0]) return true; // Google format
                if (data.responseData && data.responseData.translatedText) return true; // MyMemory format
                if (data.translated) return true; // Dreaded format
                return false;
            });

            // Extract translation from response
            if (response[0] && response[0][0] && response[0][0][0]) {
                return response[0][0][0];
            }
            if (response.responseData && response.responseData.translatedText) {
                return response.responseData.translatedText;
            }
            if (response.translated) {
                return response.translated;
            }

            throw new Error('Unable to extract translation from response');
        }, 60 * 60 * 1000); // Cache translations for 1 hour
    }

    /**
     * Simple string hash
     * @param {string} str - String to hash
     * @returns {string} Hash
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
}

// Create singleton instance
const apiHandler = new OptimizedApiHandler();

module.exports = {
    apiHandler,
    makeRequest: (url, options, retries) => apiHandler.makeRequest(url, options, retries),
    tryApisParallel: (apiConfigs, validator) => apiHandler.tryApisParallel(apiConfigs, validator),
    tryApisSequential: (apiConfigs, validator) => apiHandler.tryApisSequential(apiConfigs, validator),
    cachedCall: (cacheKey, apiCall, ttl) => apiHandler.cachedCall(cacheKey, apiCall, ttl),
    handleAiRequest: (query, service) => apiHandler.handleAiRequest(query, service),
    handleTranslation: (text, targetLang) => apiHandler.handleTranslation(text, targetLang)
};