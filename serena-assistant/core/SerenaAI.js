const axios = require('axios');
const { database } = require('../../lib/database');
// const { serena_configs, serena_clients, serena_conversations, serena_products } = require('../../db/shared/schema');
// Drizzle-orm supprimé - utilise maintenant Supabase direct

class SerenaAI {
    constructor(companionId) {
        this.companionId = companionId;
        this.config = null;
        this.apiProviders = {
            groq: {
                baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
                models: ['llama3-8b-8192', 'llama3-70b-8192', 'mixtral-8x7b-32768'],
                headers: (apiKey) => ({
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                })
            },
            huggingface: {
                baseUrl: 'https://api-inference.huggingface.co/models/',
                models: ['microsoft/DialoGPT-medium', 'facebook/blenderbot-400M-distill'],
                headers: (apiKey) => ({
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                })
            },
            openrouter: {
                baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
                models: ['google/gemma-7b-it', 'mistralai/mistral-7b-instruct'],
                headers: (apiKey) => ({
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://replit.com',
                    'X-Title': 'Serena Assistant'
                })
            }
        };
    }

    async initialize() {
        try {
            const [configResult] = await database.select()
                .from(serena_configs)
                .where(eq(serena_configs.companion_id, this.companionId));

            if (!configResult) {
                // Créer une configuration par défaut
                await this.createDefaultConfig();
                await this.initialize(); // Retry
                return;
            }

            this.config = configResult;
            console.log(`✅ [SERENA] Assistant initialisé pour ${this.companionId}`);
        } catch (error) {
            console.error(`❌ [SERENA] Erreur lors de l'initialisation:`, error);
            throw error;
        }
    }

    async createDefaultConfig() {
        const defaultConfig = {
            companion_id: this.companionId,
            assistant_name: 'Serena',
            is_enabled: false,
            personality: `Je suis Serena, votre assistante commerciale IA. Je suis professionnelle, amicale et toujours prête à aider vos clients. 
                         Je connais vos produits et services et je peux répondre aux questions, donner des conseils et aider à la vente.
                         Je reste polie et courtoise en toutes circonstances.`,
            business_info: {
                name: 'Mon Business',
                description: 'Description de mon business',
                contact: '',
                website: ''
            },
            auto_responses: {
                greeting: 'Bonjour ! Je suis Serena, votre assistante. Comment puis-je vous aider aujourd\'hui ?',
                goodbye: 'Merci de nous avoir contactés ! N\'hésitez pas à revenir si vous avez d\'autres questions.',
                unknown: 'Je ne comprends pas bien votre demande. Pouvez-vous reformuler ?'
            },
            working_hours: {
                enabled: false,
                schedule: {
                    monday: { start: '09:00', end: '18:00', enabled: true },
                    tuesday: { start: '09:00', end: '18:00', enabled: true },
                    wednesday: { start: '09:00', end: '18:00', enabled: true },
                    thursday: { start: '09:00', end: '18:00', enabled: true },
                    friday: { start: '09:00', end: '18:00', enabled: true },
                    saturday: { start: '09:00', end: '14:00', enabled: false },
                    sunday: { start: '10:00', end: '16:00', enabled: false }
                },
                timezone: 'Europe/Paris'
            },
            language: 'fr',
            api_provider: 'groq',
            max_context_messages: 10
        };

        await database.insert(serena_configs).values(defaultConfig);
        console.log(`✅ [SERENA] Configuration par défaut créée pour ${this.companionId}`);
    }

    async processMessage(clientId, message, context = {}) {
        if (!this.config || !this.config.is_enabled) {
            return null; // Assistant désactivé
        }

        try {
            // Vérifier les heures de travail
            if (!this.isWithinWorkingHours()) {
                return this.getOutOfHoursResponse();
            }

            // Récupérer le contexte de conversation
            const conversationHistory = await this.getConversationHistory(clientId);
            
            // Créer le prompt avec contexte
            const prompt = await this.buildPrompt(message, conversationHistory, context);
            
            // Générer la réponse via l'API
            const response = await this.generateResponse(prompt);
            
            // Sauvegarder la conversation
            await this.saveConversation(clientId, message, response, context);
            
            // Mettre à jour les statistiques client
            await this.updateClientStats(clientId);
            
            return response;

        } catch (error) {
            console.error(`❌ [SERENA] Erreur lors du traitement du message:`, error);
            return this.config.auto_responses.unknown || "Désolé, je ne peux pas répondre pour le moment.";
        }
    }

    async generateResponse(prompt) {
        const provider = this.config.api_provider;
        const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];

        if (!apiKey) {
            console.warn(`⚠️ [SERENA] Clé API manquante pour ${provider}, passage au fallback`);
            return this.getFallbackResponse(prompt);
        }

        // Essayer le provider principal
        try {
            const response = await this.callAPI(provider, prompt, apiKey);
            if (response) return response;
        } catch (error) {
            console.warn(`⚠️ [SERENA] Échec ${provider}, tentative fallback:`, error.message);
        }

        // Essayer les fallbacks
        const fallbackProviders = Object.keys(this.apiProviders).filter(p => p !== provider);
        
        for (const fallbackProvider of fallbackProviders) {
            const fallbackKey = process.env[`${fallbackProvider.toUpperCase()}_API_KEY`];
            if (!fallbackKey) continue;

            try {
                const response = await this.callAPI(fallbackProvider, prompt, fallbackKey);
                if (response) {
                    console.log(`✅ [SERENA] Fallback réussi avec ${fallbackProvider}`);
                    return response;
                }
            } catch (error) {
                console.warn(`⚠️ [SERENA] Échec fallback ${fallbackProvider}:`, error.message);
                continue;
            }
        }

        // Si tous les API échouent, utiliser une réponse par défaut
        return this.getFallbackResponse(prompt);
    }

    async callAPI(provider, prompt, apiKey) {
        const config = this.apiProviders[provider];
        const model = config.models[0]; // Utiliser le premier modèle disponible

        const requestData = {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: this.config.personality
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 500,
            temperature: 0.7
        };

        if (provider === 'huggingface') {
            // HuggingFace a un format différent
            const response = await axios.post(
                `${config.baseUrl}${model}`,
                {
                    inputs: prompt,
                    parameters: {
                        max_length: 500,
                        temperature: 0.7
                    }
                },
                { 
                    headers: config.headers(apiKey),
                    timeout: 15000
                }
            );

            return response.data[0]?.generated_text || null;
        } else {
            // Format OpenAI-compatible (Groq, OpenRouter)
            const response = await axios.post(
                config.baseUrl,
                requestData,
                { 
                    headers: config.headers(apiKey),
                    timeout: 15000
                }
            );

            return response.data.choices[0]?.message?.content || null;
        }
    }

    getFallbackResponse(prompt) {
        // Réponses simples basées sur des mots-clés
        const keywords = {
            'bonjour|salut|hello|bonsoir': this.config.auto_responses.greeting,
            'au revoir|bye|ciao|à bientôt': this.config.auto_responses.goodbye,
            'prix|coût|tarif|combien': 'Pour connaître nos tarifs, n\'hésitez pas à nous contacter directement.',
            'produit|article|service': 'Nous proposons plusieurs produits et services. Que recherchez-vous exactement ?',
            'livraison|expedition|envoi': 'Nous proposons plusieurs modes de livraison. Contactez-nous pour plus de détails.',
            'contact|telephone|email|joindre': `Vous pouvez nous joindre via WhatsApp ou consulter nos informations de contact.`
        };

        const lowerPrompt = prompt.toLowerCase();
        
        for (const [pattern, response] of Object.entries(keywords)) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(lowerPrompt)) {
                return response;
            }
        }

        return this.config.auto_responses.unknown;
    }

    async buildPrompt(message, history, context) {
        let prompt = `Message du client: ${message}\n\n`;
        
        // Ajouter le contexte de l'historique
        if (history.length > 0) {
            prompt += "Contexte de conversation:\n";
            history.slice(-5).forEach(msg => {
                prompt += `${msg.role === 'user' ? 'Client' : 'Serena'}: ${msg.content}\n`;
            });
            prompt += "\n";
        }

        // Ajouter les informations business
        if (this.config.business_info) {
            prompt += `Informations sur le business:\n`;
            prompt += `- Nom: ${this.config.business_info.name}\n`;
            prompt += `- Description: ${this.config.business_info.description}\n`;
            if (this.config.business_info.website) {
                prompt += `- Site web: ${this.config.business_info.website}\n`;
            }
            prompt += "\n";
        }

        // Ajouter les produits si le contexte l'indique
        if (context.includeProducts) {
            const products = await this.getActiveProducts();
            if (products.length > 0) {
                prompt += "Nos produits disponibles:\n";
                products.forEach(product => {
                    prompt += `- ${product.name}: ${product.description} (${product.price})\n`;
                });
                prompt += "\n";
            }
        }

        prompt += "Répondez de manière professionnelle et utile:";
        
        return prompt;
    }

    async getActiveProducts() {
        try {
            return await database.select()
                .from(serena_products)
                .where(and(
                    eq(serena_products.companion_id, this.companionId),
                    eq(serena_products.is_available, true)
                ));
        } catch (error) {
            console.error('❌ [SERENA] Erreur lors de la récupération des produits:', error);
            return [];
        }
    }

    async getConversationHistory(clientId) {
        try {
            return await database.select()
                .from(serena_conversations)
                .where(and(
                    eq(serena_conversations.companion_id, this.companionId),
                    eq(serena_conversations.client_id, clientId),
                    eq(serena_conversations.is_active, true)
                ))
                .orderBy(serena_conversations.created_at)
                .limit(this.config.max_context_messages);
        } catch (error) {
            console.error('❌ [SERENA] Erreur lors de la récupération de l\'historique:', error);
            return [];
        }
    }

    async saveConversation(clientId, userMessage, assistantResponse, context) {
        try {
            // Sauvegarder le message utilisateur
            await database.insert(serena_conversations).values({
                companion_id: this.companionId,
                client_id: clientId,
                message_id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: 'user',
                content: userMessage,
                context: context
            });

            // Sauvegarder la réponse de l'assistant
            await database.insert(serena_conversations).values({
                companion_id: this.companionId,
                client_id: clientId,
                message_id: `assistant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                role: 'assistant',
                content: assistantResponse,
                context: context
            });

        } catch (error) {
            console.error('❌ [SERENA] Erreur lors de la sauvegarde:', error);
        }
    }

    async updateClientStats(clientId) {
        try {
            const [client] = await database.select()
                .from(serena_clients)
                .where(and(
                    eq(serena_clients.companion_id, this.companionId),
                    eq(serena_clients.client_id, clientId)
                ));

            if (client) {
                // Mettre à jour client existant
                await database.update(serena_clients)
                    .set({
                        last_interaction: new Date(),
                        interaction_count: client.interaction_count + 1
                    })
                    .where(eq(serena_clients.id, client.id));
            } else {
                // Créer nouveau client
                await database.insert(serena_clients).values({
                    companion_id: this.companionId,
                    client_id: clientId,
                    status: 'prospect',
                    last_interaction: new Date(),
                    interaction_count: 1
                });
            }
        } catch (error) {
            console.error('❌ [SERENA] Erreur lors de la mise à jour des stats:', error);
        }
    }

    isWithinWorkingHours() {
        if (!this.config.working_hours.enabled) return true;

        const now = new Date();
        const day = now.toLocaleDateString('en', { weekday: 'lowercase' });
        const schedule = this.config.working_hours.schedule[day];

        if (!schedule || !schedule.enabled) return false;

        const currentTime = now.toLocaleTimeString('en-GB', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        return currentTime >= schedule.start && currentTime <= schedule.end;
    }

    getOutOfHoursResponse() {
        const schedule = this.config.working_hours.schedule;
        const enabledDays = Object.entries(schedule)
            .filter(([day, config]) => config.enabled)
            .map(([day]) => day);

        return `Bonjour ! Je ne suis pas disponible en ce moment. 
                Nos heures de service sont généralement du ${enabledDays[0]} au ${enabledDays[enabledDays.length - 1]}. 
                N'hésitez pas à laisser votre message, je vous répondrai dès que possible !`;
    }

    // Méthodes publiques pour la gestion
    async enable() {
        await database.update(serena_configs)
            .set({ is_enabled: true, updated_at: new Date() })
            .where(eq(serena_configs.companion_id, this.companionId));
        
        this.config.is_enabled = true;
        console.log(`✅ [SERENA] Assistant activé pour ${this.companionId}`);
    }

    async disable() {
        await database.update(serena_configs)
            .set({ is_enabled: false, updated_at: new Date() })
            .where(eq(serena_configs.companion_id, this.companionId));
        
        this.config.is_enabled = false;
        console.log(`❌ [SERENA] Assistant désactivé pour ${this.companionId}`);
    }

    isEnabled() {
        return this.config && this.config.is_enabled;
    }
}

module.exports = SerenaAI;