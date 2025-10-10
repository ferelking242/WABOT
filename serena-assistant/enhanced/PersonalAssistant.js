/**
 * Système d'Assistant Personnel Amélioré avec Noms Humains
 * 
 * Ce système permet aux companions d'avoir des assistants personnalisés avec :
 * - Des noms humains (Marie, Jean, Sophie, etc.)
 * - Des personnalités différentes
 * - Des domaines d'expertise spécifiques
 * - Des styles de communication adaptés
 */

const { supabase } = require('../../lib/supabase');
const axios = require('axios');

class PersonalAssistant {
    constructor(companionId, assistantData = null) {
        this.companionId = companionId;
        this.assistant = assistantData;
        this.humanNames = {
            female: ['Marie', 'Sophie', 'Claire', 'Emma', 'Julie', 'Laura', 'Sarah', 'Lisa', 'Anna', 'Eva'],
            male: ['Jean', 'Pierre', 'Marc', 'David', 'Paul', 'Thomas', 'Nicolas', 'Antoine', 'Julien', 'Alexandre'],
            neutral: ['Alex', 'Morgan', 'Jordan', 'Taylor', 'Casey', 'Riley', 'Quinn', 'Sage', 'Phoenix', 'River']
        };
        
        this.personalityProfiles = {
            friendly: {
                greeting: "Salut ! C'est {name} 😊 Comment ça va ?",
                style: "décontracté et chaleureux",
                emojis: true,
                formality: "casual"
            },
            professional: {
                greeting: "Bonjour, je suis {name}, votre assistant(e) professionnel(le).",
                style: "formel et efficace",
                emojis: false,
                formality: "formal"
            },
            casual: {
                greeting: "Hey ! Moi c'est {name} 👋 On peut se tutoyer !",
                style: "très décontracté",
                emojis: true,
                formality: "very_casual"
            },
            formal: {
                greeting: "Bonjour, permettez-moi de me présenter : {name}, à votre service.",
                style: "très formel et respectueux",
                emojis: false,
                formality: "very_formal"
            }
        };
    }

    /**
     * Initialiser l'assistant personnel (ne pas créer automatiquement)
     */
    async initialize() {
        try {
            // Vérifier si un assistant existe déjà
            const { data: existingAssistant, error } = await supabase
                .from('personal_assistants')
                .select('*')
                .eq('companion_id', this.companionId)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw error;
            }

            if (existingAssistant) {
                this.assistant = existingAssistant;
                console.log(`✅ Assistant ${this.assistant.assistant_name} chargé pour ${this.companionId}`);
                return this.assistant;
            }

            // Pas d'assistant trouvé - ne pas en créer automatiquement
            this.assistant = null;
            console.log(`ℹ️ Aucun assistant trouvé pour ${this.companionId}`);
            return null;
            
        } catch (error) {
            console.error('❌ Erreur lors de l\'initialisation de l\'assistant:', error);
            // En cas d'erreur DB (table n'existe pas), retourner null silencieusement
            this.assistant = null;
            return null;
        }
    }

    /**
     * Créer un nouvel assistant avec des paramètres spécifiés
     */
    async createAssistant(options = {}) {
        try {
            // Vérifier qu'aucun assistant n'existe déjà
            const existing = await this.initialize();
            if (existing) {
                throw new Error(`Un assistant existe déjà: ${existing.assistant_name}`);
            }

            const {
                name = this.getRandomHumanName(options.gender || this.getRandomGender()),
                gender = this.getRandomGender(),
                personality = this.getRandomPersonality(),
                assistantType = 'commercial',
                expertiseAreas = ['vente', 'service client', 'produits'],
                voiceStyle = 'warm'
            } = options;

            const assistantData = {
                companion_id: this.companionId,
                assistant_name: name,
                assistant_type: assistantType,
                personality_profile: personality,
                gender: gender,
                language_style: 'casual',
                expertise_areas: JSON.stringify(expertiseAreas),
                bio: this.generateBio(name, gender, personality),
                voice_style: voiceStyle,
                is_enabled: true
            };

            const { data: newAssistant, error } = await supabase
                .from('personal_assistants')
                .insert(assistantData)
                .select()
                .single();
            
            if (error) {
                throw error;
            }
            
            this.assistant = newAssistant;
            
            // Créer des réponses par défaut
            await this.createDefaultResponses(name, personality);
            
            console.log(`✅ Assistant ${name} créé pour ${this.companionId}`);
            return this.assistant;
            
        } catch (error) {
            console.error('❌ Erreur lors de la création de l\'assistant:', error);
            throw error;
        }
    }

    /**
     * Personnaliser l'assistant
     */
    async customize(options) {
        const {
            name,
            gender,
            personality,
            assistantType,
            expertiseAreas,
            bio,
            voiceStyle
        } = options;

        const updateData = {};
        
        if (name) {
            updateData.assistant_name = name;
        }
        
        if (gender) {
            updateData.gender = gender;
        }
        
        if (personality && this.personalityProfiles[personality]) {
            updateData.personality_profile = personality;
        }
        
        if (assistantType) {
            updateData.assistant_type = assistantType;
        }
        
        if (expertiseAreas) {
            updateData.expertise_areas = JSON.stringify(expertiseAreas);
        }
        
        if (bio) {
            updateData.bio = bio;
        }
        
        if (voiceStyle) {
            updateData.voice_style = voiceStyle;
        }

        updateData.updated_at = new Date();

        const { error } = await supabase
            .from('personal_assistants')
            .update(updateData)
            .eq('companion_id', this.companionId);
        
        if (error) {
            throw error;
        }

        // Recharger l'assistant
        await this.initialize();
        
        console.log(`✅ Assistant ${this.assistant.assistant_name} personnalisé`);
        return this.assistant;
    }

    /**
     * Traiter un message avec la personnalité de l'assistant
     */
    async processMessage(clientJid, message, context = {}) {
        if (!this.assistant || !this.assistant.is_enabled) {
            return null;
        }

        try {
            // Analyser le type d'interaction
            const interactionType = this.analyzeInteractionType(message);
            
            // Récupérer l'historique de conversation
            const conversationHistory = await this.getConversationHistory(clientJid);
            
            // Construire le prompt avec la personnalité
            const prompt = await this.buildPersonalizedPrompt(message, conversationHistory, context);
            
            // Générer la réponse
            const response = await this.generatePersonalizedResponse(prompt, interactionType);
            
            // Enregistrer l'interaction
            await this.recordInteraction(clientJid, message, response, interactionType);
            
            return response;

        } catch (error) {
            console.error(`❌ Erreur traitement message par ${this.assistant.assistant_name}:`, error);
            return this.getFallbackResponse(message);
        }
    }

    /**
     * Construire un prompt personnalisé avec la personnalité de l'assistant
     */
    async buildPersonalizedPrompt(message, history, context) {
        const personality = this.personalityProfiles[this.assistant.personality_profile] || this.personalityProfiles.friendly;
        const expertiseAreas = JSON.parse(this.assistant.expertise_areas || '[]');

        let prompt = `Tu es ${this.assistant.assistant_name}, un(e) assistant(e) ${this.assistant.assistant_type} ${personality.style}.\n\n`;
        
        // Ajouter la bio si elle existe
        if (this.assistant.bio) {
            prompt += `À propos de toi: ${this.assistant.bio}\n\n`;
        }
        
        // Ajouter les domaines d'expertise
        if (expertiseAreas.length > 0) {
            prompt += `Tes domaines d'expertise: ${expertiseAreas.join(', ')}\n\n`;
        }
        
        // Style de communication
        prompt += `Style de communication: ${personality.style}\n`;
        prompt += `Utilisation d'emojis: ${personality.emojis ? 'Oui, avec modération' : 'Non'}\n`;
        prompt += `Niveau de formalité: ${personality.formality}\n\n`;
        
        // Message du client
        prompt += `Message du client: "${message}"\n\n`;
        
        // Contexte historique
        if (history.length > 0) {
            prompt += `Historique récent:\n`;
            history.slice(-3).forEach(msg => {
                const role = msg.role === 'user' ? 'Client' : this.assistant.assistant_name;
                prompt += `${role}: ${msg.content}\n`;
            });
            prompt += `\n`;
        }
        
        // Instructions de réponse
        prompt += `Instructions:\n`;
        prompt += `- Réponds en tant que ${this.assistant.assistant_name}\n`;
        prompt += `- Utilise un ton ${personality.style}\n`;
        prompt += `- Reste cohérent(e) avec ta personnalité\n`;
        prompt += `- Sois utile et professionnel(le)\n`;
        if (personality.emojis) {
            prompt += `- Utilise quelques emojis appropriés\n`;
        }
        prompt += `\nRéponse:`;
        
        return prompt;
    }

    /**
     * Générer une réponse personnalisée
     */
    async generatePersonalizedResponse(prompt, interactionType) {
        // D'abord, essayer les réponses prédéfinies
        const predefinedResponse = await this.getPredefinedResponse(interactionType);
        if (predefinedResponse) {
            return this.personalizePredefinedResponse(predefinedResponse);
        }

        // Sinon, utiliser l'IA
        return await this.generateAIResponse(prompt);
    }

    /**
     * Obtenir une réponse prédéfinie
     */
    async getPredefinedResponse(interactionType) {
        try {
            const { data: response, error } = await supabase
                .from('assistant_responses')
                .select('*')
                .eq('assistant_id', this.assistant.id)
                .eq('trigger_type', interactionType)
                .eq('is_active', true)
                .order('priority', { ascending: true })
                .limit(1)
                .single();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return response?.response_template || null;
        } catch (error) {
            console.error('Erreur récupération réponse prédéfinie:', error);
            return null;
        }
    }

    /**
     * Personnaliser une réponse prédéfinie
     */
    personalizePredefinedResponse(template) {
        return template
            .replace(/{name}/g, this.assistant.assistant_name)
            .replace(/{assistant_type}/g, this.assistant.assistant_type)
            .replace(/{voice_style}/g, this.assistant.voice_style);
    }

    /**
     * Générer une réponse avec IA
     */
    async generateAIResponse(prompt) {
        // Utiliser le même système que SerenaAI mais avec le prompt personnalisé
        const apiProviders = ['groq', 'openrouter', 'huggingface'];
        
        for (const provider of apiProviders) {
            const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
            if (!apiKey) continue;

            try {
                const response = await this.callAIAPI(provider, prompt, apiKey);
                if (response) return response;
            } catch (error) {
                console.warn(`Échec ${provider}:`, error.message);
                continue;
            }
        }

        // Fallback si toutes les API échouent
        return this.getFallbackResponse();
    }

    /**
     * Appeler une API d'IA
     */
    async callAIAPI(provider, prompt, apiKey) {
        const config = {
            groq: {
                url: 'https://api.groq.com/openai/v1/chat/completions',
                model: 'llama3-8b-8192'
            },
            openrouter: {
                url: 'https://openrouter.ai/api/v1/chat/completions',
                model: 'google/gemma-7b-it'
            }
        };

        const providerConfig = config[provider];
        if (!providerConfig) return null;

        const requestData = {
            model: providerConfig.model,
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        };

        const headers = {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        };

        if (provider === 'openrouter') {
            headers['HTTP-Referer'] = 'https://replit.com';
            headers['X-Title'] = 'Personal Assistant';
        }

        const response = await axios.post(providerConfig.url, requestData, {
            headers,
            timeout: 15000
        });

        return response.data.choices[0]?.message?.content || null;
    }

    /**
     * Analyser le type d'interaction
     */
    analyzeInteractionType(message) {
        const lowerMessage = message.toLowerCase();
        
        const patterns = {
            greeting: /^(salut|bonjour|hello|hey|coucou|bonsoir)/,
            goodbye: /(au revoir|bye|ciao|à bientôt|salut$)/,
            product_inquiry: /(produit|prix|coût|tarif|acheter|vendre)/,
            support: /(aide|problème|question|support|assistance)/,
            compliment: /(merci|super|parfait|excellent|génial)/,
            complaint: /(problème|bug|erreur|pas content|déçu)/
        };

        for (const [type, pattern] of Object.entries(patterns)) {
            if (pattern.test(lowerMessage)) {
                return type;
            }
        }

        return 'general';
    }

    /**
     * Enregistrer une interaction pour l'apprentissage
     */
    async recordInteraction(clientJid, clientMessage, assistantResponse, interactionType) {
        try {
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            const { error } = await supabase
                .from('assistant_interactions')
                .insert({
                    assistant_id: this.assistant.id,
                    client_jid: clientJid,
                    session_id: sessionId,
                    interaction_type: interactionType,
                    client_message: clientMessage,
                    assistant_response: assistantResponse,
                    response_time_ms: Date.now() // Approximation
                });
            
            if (error) {
                throw error;
            }
        } catch (error) {
            console.error('Erreur enregistrement interaction:', error);
        }
    }

    /**
     * Obtenir l'historique de conversation
     */
    async getConversationHistory(clientJid) {
        try {
            const { data, error } = await supabase
                .from('assistant_interactions')
                .select('*')
                .eq('assistant_id', this.assistant.id)
                .eq('client_jid', clientJid)
                .order('created_at', { ascending: true })
                .limit(5);

            if (error) {
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Erreur récupération historique:', error);
            return [];
        }
    }

    /**
     * Créer des réponses par défaut
     */
    async createDefaultResponses(name, personality) {
        const responses = [
            {
                trigger_type: 'greeting',
                trigger_keywords: JSON.stringify(['bonjour', 'salut', 'hello', 'hey']),
                response_template: this.personalityProfiles[personality].greeting.replace('{name}', name),
                priority: 1
            },
            {
                trigger_type: 'goodbye',
                trigger_keywords: JSON.stringify(['au revoir', 'bye', 'ciao']),
                response_template: `Au revoir ! ${name} sera là quand vous aurez besoin d'aide ! 👋`,
                priority: 1
            },
            {
                trigger_type: 'product_inquiry',
                trigger_keywords: JSON.stringify(['produit', 'prix', 'coût', 'acheter']),
                response_template: `Je suis ${name} et je serais ravi(e) de vous aider avec nos produits ! Que recherchez-vous exactement ?`,
                priority: 1
            }
        ];

        for (const response of responses) {
            const { error } = await supabase
                .from('assistant_responses')
                .insert({
                    assistant_id: this.assistant?.id || 1, // Sera mis à jour après création
                    ...response
                });
            
            if (error) {
                console.error('Erreur création réponse par défaut:', error);
            }
        }
    }

    /**
     * Fonctions utilitaires
     */
    getRandomGender() {
        const genders = ['female', 'male', 'neutral'];
        return genders[Math.floor(Math.random() * genders.length)];
    }

    getRandomHumanName(gender) {
        const names = this.humanNames[gender] || this.humanNames.neutral;
        return names[Math.floor(Math.random() * names.length)];
    }

    getRandomPersonality() {
        const personalities = Object.keys(this.personalityProfiles);
        return personalities[Math.floor(Math.random() * personalities.length)];
    }

    generateBio(name, gender, personality) {
        const personalityDescriptions = {
            friendly: "une personne chaleureuse qui aime créer des liens",
            professional: "un(e) professionnel(le) expérimenté(e) et efficace",
            casual: "quelqu'un de décontracté qui aime discuter",
            formal: "une personne respectueuse et méthodique"
        };

        const genderText = gender === 'female' ? 'Je suis' : gender === 'male' ? 'Je suis' : 'Je suis';
        
        return `${genderText} ${name}, ${personalityDescriptions[personality] || 'votre assistant(e) dévoué(e)'}. Mon objectif est de vous offrir la meilleure expérience possible et de répondre à tous vos besoins avec professionnalisme et bienveillance.`;
    }

    getFallbackResponse(message = '') {
        const name = this.assistant?.assistant_name || 'votre assistant';
        const fallbacks = [
            `C'est ${name}, je suis là pour vous aider ! Pouvez-vous reformuler votre question ?`,
            `${name} à votre service ! Je n'ai pas bien compris, pouvez-vous préciser ?`,
            `Bonjour ! ${name} ici. Comment puis-je vous assister aujourd'hui ?`
        ];
        
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // Getters
    getName() {
        return this.assistant?.assistant_name || 'Assistant';
    }

    getPersonality() {
        return this.assistant?.personality_profile || 'friendly';
    }

    isEnabled() {
        return this.assistant?.is_enabled || false;
    }
}

module.exports = PersonalAssistant;