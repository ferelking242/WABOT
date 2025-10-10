/**
 * Système de détection automatique de pays à partir des numéros de téléphone
 * Base de données complète des codes pays africains et internationaux
 * Optimisé pour les pays africains francophones et les pays du monde entier
 */

// Base de données complète des codes pays avec priorité Afrique francophone
const COUNTRY_CODES_DATABASE = {
    // =================== AFRIQUE FRANCOPHONE ===================
    // Afrique Centrale
    '237': { code: '+237', name: 'Cameroun', iso: 'CM', region: 'Afrique Centrale' },
    '236': { code: '+236', name: 'République Centrafricaine', iso: 'CF', region: 'Afrique Centrale' },
    '235': { code: '+235', name: 'Tchad', iso: 'TD', region: 'Afrique Centrale' },
    '242': { code: '+242', name: 'Congo Brazzaville (MTN)', iso: 'CG', region: 'Afrique Centrale' },
    '243': { code: '+243', name: 'République Démocratique du Congo', iso: 'CD', region: 'Afrique Centrale' },
    '240': { code: '+240', name: 'Guinée Équatoriale', iso: 'GQ', region: 'Afrique Centrale' },
    '241': { code: '+241', name: 'Gabon', iso: 'GA', region: 'Afrique Centrale' },

    // Afrique de l'Ouest
    '229': { code: '+229', name: 'Bénin', iso: 'BJ', region: 'Afrique de l\'Ouest' },
    '226': { code: '+226', name: 'Burkina Faso', iso: 'BF', region: 'Afrique de l\'Ouest' },
    '225': { code: '+225', name: 'Côte d\'Ivoire', iso: 'CI', region: 'Afrique de l\'Ouest' },
    '224': { code: '+224', name: 'Guinée', iso: 'GN', region: 'Afrique de l\'Ouest' },
    '223': { code: '+223', name: 'Mali', iso: 'ML', region: 'Afrique de l\'Ouest' },
    '222': { code: '+222', name: 'Mauritanie', iso: 'MR', region: 'Afrique de l\'Ouest' },
    '227': { code: '+227', name: 'Niger', iso: 'NE', region: 'Afrique de l\'Ouest' },
    '221': { code: '+221', name: 'Sénégal', iso: 'SN', region: 'Afrique de l\'Ouest' },
    '228': { code: '+228', name: 'Togo', iso: 'TG', region: 'Afrique de l\'Ouest' },

    // Océan Indien
    '262': { code: '+262', name: 'Réunion/Mayotte', iso: 'RE', region: 'Océan Indien' },
    '269': { code: '+269', name: 'Comores', iso: 'KM', region: 'Océan Indien' },
    '261': { code: '+261', name: 'Madagascar', iso: 'MG', region: 'Océan Indien' },
    '230': { code: '+230', name: 'Maurice', iso: 'MU', region: 'Océan Indien' },
    '248': { code: '+248', name: 'Seychelles', iso: 'SC', region: 'Océan Indien' },

    // Maghreb
    '213': { code: '+213', name: 'Algérie', iso: 'DZ', region: 'Afrique du Nord' },
    '212': { code: '+212', name: 'Maroc', iso: 'MA', region: 'Afrique du Nord' },
    '216': { code: '+216', name: 'Tunisie', iso: 'TN', region: 'Afrique du Nord' },

    // =================== AUTRES PAYS AFRICAINS ===================
    '20': { code: '+20', name: 'Égypte', iso: 'EG', region: 'Afrique du Nord' },
    '218': { code: '+218', name: 'Libye', iso: 'LY', region: 'Afrique du Nord' },
    '249': { code: '+249', name: 'Soudan', iso: 'SD', region: 'Afrique du Nord' },
    '211': { code: '+211', name: 'Soudan du Sud', iso: 'SS', region: 'Afrique de l\'Est' },
    
    // Afrique de l'Est
    '251': { code: '+251', name: 'Éthiopie', iso: 'ET', region: 'Afrique de l\'Est' },
    '254': { code: '+254', name: 'Kenya', iso: 'KE', region: 'Afrique de l\'Est' },
    '256': { code: '+256', name: 'Ouganda', iso: 'UG', region: 'Afrique de l\'Est' },
    '255': { code: '+255', name: 'Tanzanie', iso: 'TZ', region: 'Afrique de l\'Est' },
    '250': { code: '+250', name: 'Rwanda', iso: 'RW', region: 'Afrique de l\'Est' },
    '257': { code: '+257', name: 'Burundi', iso: 'BI', region: 'Afrique de l\'Est' },
    '252': { code: '+252', name: 'Somalie', iso: 'SO', region: 'Afrique de l\'Est' },
    '253': { code: '+253', name: 'Djibouti', iso: 'DJ', region: 'Afrique de l\'Est' },
    '291': { code: '+291', name: 'Érythrée', iso: 'ER', region: 'Afrique de l\'Est' },

    // Afrique Australe
    '27': { code: '+27', name: 'Afrique du Sud', iso: 'ZA', region: 'Afrique Australe' },
    '267': { code: '+267', name: 'Botswana', iso: 'BW', region: 'Afrique Australe' },
    '268': { code: '+268', name: 'Eswatini', iso: 'SZ', region: 'Afrique Australe' },
    '266': { code: '+266', name: 'Lesotho', iso: 'LS', region: 'Afrique Australe' },
    '264': { code: '+264', name: 'Namibie', iso: 'NA', region: 'Afrique Australe' },
    '263': { code: '+263', name: 'Zimbabwe', iso: 'ZW', region: 'Afrique Australe' },
    '260': { code: '+260', name: 'Zambie', iso: 'ZM', region: 'Afrique Australe' },
    '265': { code: '+265', name: 'Malawi', iso: 'MW', region: 'Afrique Australe' },
    '258': { code: '+258', name: 'Mozambique', iso: 'MZ', region: 'Afrique Australe' },

    // Autres pays africains
    '234': { code: '+234', name: 'Nigeria', iso: 'NG', region: 'Afrique de l\'Ouest' },
    '233': { code: '+233', name: 'Ghana', iso: 'GH', region: 'Afrique de l\'Ouest' },
    '232': { code: '+232', name: 'Sierra Leone', iso: 'SL', region: 'Afrique de l\'Ouest' },
    '231': { code: '+231', name: 'Liberia', iso: 'LR', region: 'Afrique de l\'Ouest' },
    '220': { code: '+220', name: 'Gambie', iso: 'GM', region: 'Afrique de l\'Ouest' },
    '245': { code: '+245', name: 'Guinée-Bissau', iso: 'GW', region: 'Afrique de l\'Ouest' },
    '238': { code: '+238', name: 'Cap-Vert', iso: 'CV', region: 'Afrique de l\'Ouest' },
    '239': { code: '+239', name: 'São Tomé-et-Príncipe', iso: 'ST', region: 'Afrique Centrale' },
    '244': { code: '+244', name: 'Angola', iso: 'AO', region: 'Afrique Australe' },

    // =================== EUROPE ===================
    '33': { code: '+33', name: 'France', iso: 'FR', region: 'Europe' },
    '32': { code: '+32', name: 'Belgique', iso: 'BE', region: 'Europe' },
    '41': { code: '+41', name: 'Suisse', iso: 'CH', region: 'Europe' },
    '352': { code: '+352', name: 'Luxembourg', iso: 'LU', region: 'Europe' },
    '377': { code: '+377', name: 'Monaco', iso: 'MC', region: 'Europe' },
    '590': { code: '+590', name: 'Guadeloupe', iso: 'GP', region: 'Caraïbes' },
    '594': { code: '+594', name: 'Guyane', iso: 'GF', region: 'Amérique du Sud' },
    '596': { code: '+596', name: 'Martinique', iso: 'MQ', region: 'Caraïbes' },
    '508': { code: '+508', name: 'Saint-Pierre-et-Miquelon', iso: 'PM', region: 'Amérique du Nord' },
    '681': { code: '+681', name: 'Wallis-et-Futuna', iso: 'WF', region: 'Océanie' },
    '687': { code: '+687', name: 'Nouvelle-Calédonie', iso: 'NC', region: 'Océanie' },
    '689': { code: '+689', name: 'Polynésie française', iso: 'PF', region: 'Océanie' },

    '44': { code: '+44', name: 'Royaume-Uni', iso: 'GB', region: 'Europe' },
    '49': { code: '+49', name: 'Allemagne', iso: 'DE', region: 'Europe' },
    '39': { code: '+39', name: 'Italie', iso: 'IT', region: 'Europe' },
    '34': { code: '+34', name: 'Espagne', iso: 'ES', region: 'Europe' },
    '351': { code: '+351', name: 'Portugal', iso: 'PT', region: 'Europe' },
    '31': { code: '+31', name: 'Pays-Bas', iso: 'NL', region: 'Europe' },

    // =================== AMÉRIQUE DU NORD (NANP - Codes plus spécifiques) ===================
    '1': { code: '+1', name: 'États-Unis/Canada', iso: 'US', region: 'Amérique du Nord' },
    '1242': { code: '+1242', name: 'Bahamas', iso: 'BS', region: 'Caraïbes' },
    '1246': { code: '+1246', name: 'Barbade', iso: 'BB', region: 'Caraïbes' },
    '1264': { code: '+1264', name: 'Anguilla', iso: 'AI', region: 'Caraïbes' },
    '1268': { code: '+1268', name: 'Antigua-et-Barbuda', iso: 'AG', region: 'Caraïbes' },
    '1284': { code: '+1284', name: 'Îles Vierges britanniques', iso: 'VG', region: 'Caraïbes' },
    '1340': { code: '+1340', name: 'Îles Vierges américaines', iso: 'VI', region: 'Caraïbes' },
    '1345': { code: '+1345', name: 'Îles Caïmans', iso: 'KY', region: 'Caraïbes' },
    '1441': { code: '+1441', name: 'Bermudes', iso: 'BM', region: 'Caraïbes' },
    '1473': { code: '+1473', name: 'Grenade', iso: 'GD', region: 'Caraïbes' },
    '1649': { code: '+1649', name: 'Îles Turques-et-Caïques', iso: 'TC', region: 'Caraïbes' },
    '1664': { code: '+1664', name: 'Montserrat', iso: 'MS', region: 'Caraïbes' },
    '1721': { code: '+1721', name: 'Saint-Martin', iso: 'SX', region: 'Caraïbes' },
    '1758': { code: '+1758', name: 'Sainte-Lucie', iso: 'LC', region: 'Caraïbes' },
    '1767': { code: '+1767', name: 'Dominique', iso: 'DM', region: 'Caraïbes' },
    '1784': { code: '+1784', name: 'Saint-Vincent-et-les-Grenadines', iso: 'VC', region: 'Caraïbes' },
    '1787': { code: '+1787', name: 'Porto Rico', iso: 'PR', region: 'Caraïbes' },
    '1809': { code: '+1809', name: 'République dominicaine', iso: 'DO', region: 'Caraïbes' },
    '1829': { code: '+1829', name: 'République dominicaine', iso: 'DO', region: 'Caraïbes' },
    '1849': { code: '+1849', name: 'République dominicaine', iso: 'DO', region: 'Caraïbes' },
    '1868': { code: '+1868', name: 'Trinité-et-Tobago', iso: 'TT', region: 'Caraïbes' },
    '1869': { code: '+1869', name: 'Saint-Christophe-et-Niévès', iso: 'KN', region: 'Caraïbes' },
    '1876': { code: '+1876', name: 'Jamaïque', iso: 'JM', region: 'Caraïbes' },
    '1939': { code: '+1939', name: 'Porto Rico', iso: 'PR', region: 'Caraïbes' },

    // =================== ASIE ===================
    '86': { code: '+86', name: 'Chine', iso: 'CN', region: 'Asie' },
    '91': { code: '+91', name: 'Inde', iso: 'IN', region: 'Asie' },
    '81': { code: '+81', name: 'Japon', iso: 'JP', region: 'Asie' },
    '82': { code: '+82', name: 'Corée du Sud', iso: 'KR', region: 'Asie' },
    '65': { code: '+65', name: 'Singapour', iso: 'SG', region: 'Asie' },
    '60': { code: '+60', name: 'Malaisie', iso: 'MY', region: 'Asie' },
    '66': { code: '+66', name: 'Thaïlande', iso: 'TH', region: 'Asie' },
    '84': { code: '+84', name: 'Vietnam', iso: 'VN', region: 'Asie' },
    '62': { code: '+62', name: 'Indonésie', iso: 'ID', region: 'Asie' },
    '63': { code: '+63', name: 'Philippines', iso: 'PH', region: 'Asie' },

    // =================== MOYEN-ORIENT ===================
    '971': { code: '+971', name: 'Émirats Arabes Unis', iso: 'AE', region: 'Moyen-Orient' },
    '966': { code: '+966', name: 'Arabie Saoudite', iso: 'SA', region: 'Moyen-Orient' },
    '974': { code: '+974', name: 'Qatar', iso: 'QA', region: 'Moyen-Orient' },
    '965': { code: '+965', name: 'Koweït', iso: 'KW', region: 'Moyen-Orient' },
    '973': { code: '+973', name: 'Bahreïn', iso: 'BH', region: 'Moyen-Orient' },
    '968': { code: '+968', name: 'Oman', iso: 'OM', region: 'Moyen-Orient' },
    '961': { code: '+961', name: 'Liban', iso: 'LB', region: 'Moyen-Orient' },
    '963': { code: '+963', name: 'Syrie', iso: 'SY', region: 'Moyen-Orient' },
    '962': { code: '+962', name: 'Jordanie', iso: 'JO', region: 'Moyen-Orient' },
    '972': { code: '+972', name: 'Israël', iso: 'IL', region: 'Moyen-Orient' },
    '970': { code: '+970', name: 'Palestine', iso: 'PS', region: 'Moyen-Orient' },
    '964': { code: '+964', name: 'Irak', iso: 'IQ', region: 'Moyen-Orient' },
    '98': { code: '+98', name: 'Iran', iso: 'IR', region: 'Moyen-Orient' },
    '90': { code: '+90', name: 'Turquie', iso: 'TR', region: 'Moyen-Orient' },

    // =================== AMÉRIQUE DU SUD ===================
    '55': { code: '+55', name: 'Brésil', iso: 'BR', region: 'Amérique du Sud' },
    '54': { code: '+54', name: 'Argentine', iso: 'AR', region: 'Amérique du Sud' },
    '56': { code: '+56', name: 'Chili', iso: 'CL', region: 'Amérique du Sud' },
    '57': { code: '+57', name: 'Colombie', iso: 'CO', region: 'Amérique du Sud' },
    '51': { code: '+51', name: 'Pérou', iso: 'PE', region: 'Amérique du Sud' },
    '58': { code: '+58', name: 'Venezuela', iso: 'VE', region: 'Amérique du Sud' },
    '593': { code: '+593', name: 'Équateur', iso: 'EC', region: 'Amérique du Sud' },
    '591': { code: '+591', name: 'Bolivie', iso: 'BO', region: 'Amérique du Sud' },
    '595': { code: '+595', name: 'Paraguay', iso: 'PY', region: 'Amérique du Sud' },
    '598': { code: '+598', name: 'Uruguay', iso: 'UY', region: 'Amérique du Sud' },
    '597': { code: '+597', name: 'Suriname', iso: 'SR', region: 'Amérique du Sud' },
    '592': { code: '+592', name: 'Guyana', iso: 'GY', region: 'Amérique du Sud' }
};

class CountryDetectionSystem {
    constructor() {
        this.database = COUNTRY_CODES_DATABASE;
    }

    /**
     * Détecte le pays à partir d'un numéro de téléphone
     * Priorité donnée aux codes plus longs (plus spécifiques)
     */
    detectCountryFromPhone(phoneNumber) {
        if (!phoneNumber || typeof phoneNumber !== 'string') {
            return { code: null, name: null, iso: null, region: null, confidence: 0 };
        }

        // Nettoyer le numéro (enlever espaces, tirets, parenthèses)
        const cleanPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        
        if (!cleanPhone || cleanPhone.length < 3) {
            return { code: null, name: null, iso: null, region: null, confidence: 0 };
        }

        // Essayer de trouver le code pays le plus long en premier (plus précis)
        const possibleCodes = Object.keys(this.database).sort((a, b) => b.length - a.length);
        
        for (const code of possibleCodes) {
            if (cleanPhone.startsWith(code)) {
                const countryInfo = this.database[code];
                const confidence = this.calculateConfidence(cleanPhone, code);
                
                return {
                    code: countryInfo.code,
                    name: countryInfo.name,
                    iso: countryInfo.iso,
                    region: countryInfo.region,
                    confidence: confidence,
                    detectedPattern: code
                };
            }
        }

        // Si aucun code trouvé, essayer des patterns spéciaux
        return this.detectSpecialPatterns(cleanPhone);
    }

    /**
     * Calcule le niveau de confiance de la détection
     */
    calculateConfidence(phoneNumber, detectedCode) {
        // Plus le code est long, plus on est confiant
        let confidence = Math.min(90, detectedCode.length * 30);
        
        // Ajuster selon la longueur totale du numéro
        const totalLength = phoneNumber.length;
        const expectedLength = this.getExpectedLength(detectedCode);
        
        if (totalLength >= expectedLength.min && totalLength <= expectedLength.max) {
            confidence += 10;
        } else if (Math.abs(totalLength - expectedLength.min) <= 2) {
            confidence += 5;
        }

        return Math.min(100, confidence);
    }

    /**
     * Obtient la longueur attendue pour un code pays
     */
    getExpectedLength(countryCode) {
        const lengthMap = {
            // Codes courts (longueur variable)
            '1': { min: 11, max: 11 }, // USA/Canada (+1 + 10 digits)
            '7': { min: 11, max: 11 }, // Russie
            '20': { min: 10, max: 12 }, // Égypte
            '27': { min: 9, max: 11 }, // Afrique du Sud
            
            // Codes à 3 chiffres (plus standards)
            '242': { min: 9, max: 12 }, // Congo
            '237': { min: 9, max: 11 }, // Cameroun
            '221': { min: 9, max: 12 }, // Sénégal
            '225': { min: 8, max: 10 }, // Côte d'Ivoire
            
            // Défaut pour les autres
            'default': { min: 8, max: 15 }
        };

        return lengthMap[countryCode] || lengthMap['default'];
    }

    /**
     * Détection de patterns spéciaux pour les numéros non-standards
     * Utilisé uniquement en dernier recours avec confiance réduite
     */
    detectSpecialPatterns(phoneNumber) {
        // Ne retourner que des suggestions à faible confiance pour éviter les fausses détections
        console.log(`🔍 Aucun code pays détecté pour: ${phoneNumber.substring(0, 5)}...`);
        
        return { code: null, name: null, iso: null, region: null, confidence: 0 };
    }

    /**
     * Obtient la liste complète des pays par région
     */
    getCountriesByRegion(region = null) {
        if (!region) {
            return Object.values(this.database);
        }

        return Object.values(this.database).filter(country => 
            country.region.toLowerCase().includes(region.toLowerCase())
        );
    }

    /**
     * Recherche un pays par nom ou code ISO
     */
    searchCountry(query) {
        const searchTerm = query.toLowerCase();
        
        return Object.values(this.database).filter(country => 
            country.name.toLowerCase().includes(searchTerm) ||
            country.iso.toLowerCase() === searchTerm ||
            country.code.includes(searchTerm)
        );
    }

    /**
     * Valide un numéro de téléphone pour un pays spécifique
     */
    validatePhoneForCountry(phoneNumber, countryCode) {
        const detection = this.detectCountryFromPhone(phoneNumber);
        return detection.code === countryCode && detection.confidence >= 80;
    }

    /**
     * Formate un numéro de téléphone selon les standards du pays
     */
    formatPhoneNumber(phoneNumber, targetFormat = 'international') {
        const detection = this.detectCountryFromPhone(phoneNumber);
        
        if (!detection.code) {
            return phoneNumber; // Retourne tel quel si pas de détection
        }

        const cleanPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');
        
        switch (targetFormat) {
            case 'international':
                return detection.code + ' ' + cleanPhone.substring(detection.detectedPattern.length);
            case 'national':
                return '0' + cleanPhone.substring(detection.detectedPattern.length);
            default:
                return cleanPhone;
        }
    }

    /**
     * Obtient les statistiques de la base de données
     */
    getDatabaseStats() {
        const regions = {};
        let totalCountries = 0;

        Object.values(this.database).forEach(country => {
            totalCountries++;
            if (!regions[country.region]) {
                regions[country.region] = 0;
            }
            regions[country.region]++;
        });

        return {
            totalCountries,
            regions,
            africanCountries: (regions['Afrique Centrale'] || 0) + (regions['Afrique de l\'Ouest'] || 0) + 
                            (regions['Afrique du Nord'] || 0) + (regions['Afrique de l\'Est'] || 0) + 
                            (regions['Afrique Australe'] || 0) + (regions['Océan Indien'] || 0),
            lastUpdated: '2025-09-23'
        };
    }
}

// Instance singleton
const countryDetector = new CountryDetectionSystem();

module.exports = {
    CountryDetectionSystem,
    countryDetector,
    COUNTRY_CODES_DATABASE
};