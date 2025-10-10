const axios = require('axios');
const cheerio = require('cheerio');
const { supabase } = require('../../lib/supabase');

class ProductAnalyzer {
    constructor(companionId) {
        this.companionId = companionId;
        this.allowedDomains = [
            // E-commerce platforms populaires
            'shopify.com', 'shopify.ca', 'myshopify.com',
            'woocommerce.com', 'wordpress.com', 'wordpress.org',
            'bigcommerce.com',
            'prestashop.com',
            'magento.com', 'magento.org',
            'wix.com', 'wixsite.com',
            'squarespace.com',
            'etsy.com',
            'amazon.fr', 'amazon.com', 'amazon.co.uk', 'amazon.de',
            'ebay.fr', 'ebay.com',
            'cdiscount.com',
            'fnac.com',
            'darty.com',
            'boulanger.com',
            // Autres domaines légitimes connus
            'github.io',
            'netlify.app',
            'vercel.app',
            'herokuapp.com'
        ];
        
        // IPs et domaines privés/locaux à bloquer
        this.blockedPatterns = [
            /^localhost$/i,
            /^127\./,
            /^10\./,
            /^172\.(1[6-9]|2[0-9]|3[01])\./,
            /^192\.168\./,
            /^169\.254\./,
            /^::1$/,
            /^fc00:/i,
            /^fe80:/i,
            /\.local$/i
        ];
    }

    async analyzeProductLink(url) {
        try {
            console.log(`🔍 [PRODUCT-ANALYZER] Analyse du lien: ${url}`);

            // Validation de sécurité de l'URL
            if (!this.isUrlSafe(url)) {
                throw new Error('URL non autorisée pour des raisons de sécurité');
            }

            // Vérifier si le lien a déjà été analysé
            const { data: existingLink, error } = await supabase
                .from('serena_product_links')
                .select('*')
                .eq('companion_id', this.companionId)
                .eq('link_url', url)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('Erreur vérification lien existant:', error);
            }

            if (existingLink && existingLink.analyzed) {
                console.log(`📋 [PRODUCT-ANALYZER] Lien déjà analysé, utilisation du cache`);
                return this.getCachedProducts(url);
            }

            // Récupérer le contenu de la page
            const pageContent = await this.fetchPageContent(url);
            if (!pageContent) {
                throw new Error('Impossible de récupérer le contenu de la page');
            }

            // Analyser et extraire les produits
            const products = await this.extractProducts(pageContent, url);

            // Sauvegarder les résultats
            await this.saveAnalysisResults(url, products);

            console.log(`✅ [PRODUCT-ANALYZER] ${products.length} produits trouvés et sauvegardés`);
            return products;

        } catch (error) {
            console.error(`❌ [PRODUCT-ANALYZER] Erreur lors de l'analyse:`, error);
            
            // Sauvegarder l'échec d'analyse
            await this.saveAnalysisResults(url, [], false);
            
            throw error;
        }
    }

    isUrlSafe(url) {
        try {
            const parsedUrl = new URL(url);
            
            // Vérifier le protocole
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                console.warn(`❌ [SECURITY] Protocole non autorisé: ${parsedUrl.protocol}`);
                return false;
            }

            // Vérifier le hostname contre les patterns bloqués
            for (const pattern of this.blockedPatterns) {
                if (pattern.test(parsedUrl.hostname)) {
                    console.warn(`❌ [SECURITY] Hostname bloqué: ${parsedUrl.hostname}`);
                    return false;
                }
            }

            // Vérifier si le domaine est dans la liste autorisée
            const isAllowed = this.allowedDomains.some(domain => {
                return parsedUrl.hostname === domain || 
                       parsedUrl.hostname.endsWith('.' + domain);
            });

            if (!isAllowed) {
                console.warn(`❌ [SECURITY] Domaine non autorisé: ${parsedUrl.hostname}`);
                return false;
            }

            console.log(`✅ [SECURITY] URL validée: ${parsedUrl.hostname}`);
            return true;

        } catch (error) {
            console.warn(`❌ [SECURITY] URL invalide: ${url}`, error);
            return false;
        }
    }

    async fetchPageContent(url) {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 15000,
                maxRedirects: 5
            });

            return response.data;
        } catch (error) {
            console.error(`❌ [PRODUCT-ANALYZER] Erreur lors de la récupération de ${url}:`, error.message);
            return null;
        }
    }

    async extractProducts(htmlContent, url) {
        const $ = cheerio.load(htmlContent);
        const products = [];
        const domain = new URL(url).hostname;

        // Stratégies d'extraction basées sur les patterns communs
        const extractionStrategies = [
            this.extractFromStructuredData.bind(this),
            this.extractFromCommonSelectors.bind(this),
            this.extractFromMeta.bind(this),
            this.extractFromOpenGraph.bind(this),
            this.extractFromMicrodata.bind(this)
        ];

        for (const strategy of extractionStrategies) {
            const strategyProducts = strategy($, url, domain);
            products.push(...strategyProducts);
        }

        // Dédupliquer les produits basés sur le nom
        const uniqueProducts = this.deduplicateProducts(products);

        return uniqueProducts.slice(0, 50); // Limiter à 50 produits max
    }

    extractFromStructuredData($, url, domain) {
        const products = [];
        
        // Rechercher les données JSON-LD
        $('script[type="application/ld+json"]').each((i, elem) => {
            try {
                const jsonData = JSON.parse($(elem).html());
                const items = Array.isArray(jsonData) ? jsonData : [jsonData];
                
                items.forEach(item => {
                    if (item['@type'] === 'Product' || item.type === 'Product') {
                        products.push(this.parseStructuredProduct(item, url));
                    } else if (item['@type'] === 'ItemList' && item.itemListElement) {
                        item.itemListElement.forEach(listItem => {
                            if (listItem.item && listItem.item['@type'] === 'Product') {
                                products.push(this.parseStructuredProduct(listItem.item, url));
                            }
                        });
                    }
                });
            } catch (error) {
                // Ignorer les erreurs de parsing JSON
            }
        });

        return products;
    }

    extractFromCommonSelectors($, url, domain) {
        const products = [];
        
        // Sélecteurs communs pour les produits
        const productSelectors = [
            '.product-item, .product-card, .product',
            '.woocommerce-product, .single-product',
            '.shopify-product-card, .product-wrap',
            '.item, .product-container',
            '[data-product], [data-product-id]'
        ];

        productSelectors.forEach(selector => {
            $(selector).each((i, elem) => {
                const $product = $(elem);
                const product = this.extractProductFromElement($product, url);
                if (product && product.name) {
                    products.push(product);
                }
            });
        });

        return products;
    }

    extractFromMeta($, url, domain) {
        const products = [];
        
        // Extraire depuis les meta tags (pour les pages produit unique)
        const productMeta = {
            name: this.getMetaContent($, ['product:title', 'product:name', 'title']),
            description: this.getMetaContent($, ['product:description', 'description']),
            price: this.getMetaContent($, ['product:price:amount', 'product:price']),
            image: this.getMetaContent($, ['product:image', 'image']),
            category: this.getMetaContent($, ['product:category', 'product:section'])
        };

        if (productMeta.name) {
            products.push({
                ...productMeta,
                product_id: this.generateProductId(productMeta.name, url),
                metadata: {
                    source: 'meta_tags',
                    url: url,
                    extracted_at: new Date().toISOString()
                }
            });
        }

        return products;
    }

    extractFromOpenGraph($, url, domain) {
        const products = [];
        
        // Extraire depuis les Open Graph tags
        const ogProduct = {
            name: $('meta[property="og:title"]').attr('content'),
            description: $('meta[property="og:description"]').attr('content'),
            image: $('meta[property="og:image"]').attr('content'),
            price: $('meta[property="product:price:amount"]').attr('content'),
            category: $('meta[property="product:category"]').attr('content')
        };

        if (ogProduct.name) {
            products.push({
                ...ogProduct,
                product_id: this.generateProductId(ogProduct.name, url),
                metadata: {
                    source: 'open_graph',
                    url: url,
                    extracted_at: new Date().toISOString()
                }
            });
        }

        return products;
    }

    extractFromMicrodata($, url, domain) {
        const products = [];
        
        // Rechercher les microdonnées schema.org
        $('[itemtype*="schema.org/Product"]').each((i, elem) => {
            const $product = $(elem);
            const product = {
                name: $product.find('[itemprop="name"]').text().trim(),
                description: $product.find('[itemprop="description"]').text().trim(),
                price: $product.find('[itemprop="price"]').attr('content') || $product.find('[itemprop="price"]').text().trim(),
                image: $product.find('[itemprop="image"]').attr('src') || $product.find('[itemprop="image"]').attr('content'),
                category: $product.find('[itemprop="category"]').text().trim()
            };

            if (product.name) {
                product.product_id = this.generateProductId(product.name, url);
                product.metadata = {
                    source: 'microdata',
                    url: url,
                    extracted_at: new Date().toISOString()
                };
                products.push(product);
            }
        });

        return products;
    }

    extractProductFromElement($element, baseUrl) {
        const name = this.extractText($element, [
            '.product-name, .product-title, .title, h1, h2, h3',
            '[data-product-name], [data-title]',
            '.name, .product-info .title'
        ]);

        const description = this.extractText($element, [
            '.product-description, .description, .summary',
            '.product-excerpt, .excerpt',
            '.content, .details'
        ]);

        const price = this.extractText($element, [
            '.price, .product-price, .cost',
            '.amount, .value, .money',
            '[data-price], [data-cost]'
        ]);

        const image = this.extractImage($element, baseUrl);

        if (!name) return null;

        return {
            name: name,
            description: description || '',
            price: this.cleanPrice(price),
            images: image ? [image] : [],
            product_id: this.generateProductId(name, baseUrl),
            metadata: {
                source: 'element_extraction',
                url: baseUrl,
                extracted_at: new Date().toISOString()
            }
        };
    }

    extractText($element, selectors) {
        for (const selector of selectors) {
            const text = $element.find(selector).first().text().trim();
            if (text) return text;
        }
        return '';
    }

    extractImage($element, baseUrl) {
        const imgSelectors = [
            'img.product-image, img.product-photo',
            '.product-image img, .product-photo img',
            'img[data-product-image], img[data-src]',
            'img'
        ];

        for (const selector of imgSelectors) {
            const $img = $element.find(selector).first();
            if ($img.length) {
                let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy');
                if (src) {
                    return this.resolveUrl(src, baseUrl);
                }
            }
        }
        return null;
    }

    getMetaContent($, selectors) {
        for (const selector of selectors) {
            const content = $(`meta[name="${selector}"], meta[property="${selector}"]`).attr('content');
            if (content) return content;
        }
        return null;
    }

    parseStructuredProduct(productData, baseUrl) {
        return {
            name: productData.name || productData.title,
            description: productData.description,
            price: this.extractPriceFromOffer(productData.offers),
            images: this.extractImagesFromData(productData.image),
            category: productData.category,
            product_id: this.generateProductId(productData.name || productData.title, baseUrl),
            metadata: {
                source: 'structured_data',
                url: baseUrl,
                sku: productData.sku,
                brand: productData.brand ? productData.brand.name : null,
                extracted_at: new Date().toISOString()
            }
        };
    }

    extractPriceFromOffer(offers) {
        if (!offers) return null;
        
        const offerArray = Array.isArray(offers) ? offers : [offers];
        const offer = offerArray[0];
        
        if (offer && offer.price) {
            return `${offer.price} ${offer.priceCurrency || '€'}`;
        }
        
        return null;
    }

    extractImagesFromData(imageData) {
        if (!imageData) return [];
        
        if (typeof imageData === 'string') return [imageData];
        if (Array.isArray(imageData)) return imageData;
        if (imageData.url) return [imageData.url];
        
        return [];
    }

    cleanPrice(priceText) {
        if (!priceText) return null;
        
        // Nettoyer et formater le prix
        const cleaned = priceText
            .replace(/[^\d.,€$£¥₹\s]/g, '')
            .trim();
            
        return cleaned || null;
    }

    generateProductId(name, url) {
        const urlPart = new URL(url).pathname.slice(1, 10);
        const namePart = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
        return `${this.companionId}_${namePart}_${urlPart}_${Date.now()}`;
    }

    resolveUrl(url, baseUrl) {
        if (url.startsWith('http')) return url;
        if (url.startsWith('//')) return `https:${url}`;
        
        const base = new URL(baseUrl);
        return new URL(url, base.origin).href;
    }

    deduplicateProducts(products) {
        const seen = new Set();
        return products.filter(product => {
            const key = product.name.toLowerCase().trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async saveAnalysisResults(url, products, success = true) {
        try {
            // Sauvegarder ou mettre à jour le lien analysé
            const { error: linkError } = await supabase
                .from('serena_product_links')
                .upsert({
                    companion_id: this.companionId,
                    link_url: url,
                    analyzed: success,
                    products_found: products.length,
                    analysis_data: {
                        products: products,
                        analyzed_at: new Date().toISOString()
                    },
                    last_analyzed: new Date(),
                    is_active: true
                }, {
                    onConflict: 'link_url'
                });

            if (linkError) {
                throw linkError;
            }

            // Sauvegarder les produits individuels
            if (success && products.length > 0) {
                for (const product of products) {
                    const { error: productError } = await supabase
                        .from('serena_products')
                        .upsert({
                            companion_id: this.companionId,
                            product_id: product.product_id,
                            name: product.name,
                            description: product.description || '',
                            price: product.price || 'Prix à définir',
                            category: product.category || 'Non catégorisé',
                            images: product.images || [],
                            is_available: true,
                            metadata: product.metadata || {},
                            updated_at: new Date()
                        }, {
                            onConflict: 'product_id'
                        });

                    if (productError) {
                        console.error('Erreur sauvegarde produit:', productError);
                    }
                }
            }

        } catch (error) {
            console.error('❌ [PRODUCT-ANALYZER] Erreur lors de la sauvegarde:', error);
        }
    }

    async getCachedProducts(url) {
        try {
            const { data: linkData, error } = await supabase
                .from('serena_product_links')
                .select('*')
                .eq('companion_id', this.companionId)
                .eq('link_url', url)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            if (linkData && linkData.analysis_data && linkData.analysis_data.products) {
                return linkData.analysis_data.products;
            }

            return [];
        } catch (error) {
            console.error('❌ [PRODUCT-ANALYZER] Erreur lors de la récupération du cache:', error);
            return [];
        }
    }
}

module.exports = ProductAnalyzer;