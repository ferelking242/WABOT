/**
 * Utilitaire centralisé pour la gestion des fichiers temporaires
 * Corrige le chaos temp/tmp avec une API unifiée
 */

const fs = require('fs');
const path = require('path');

// Dossier temporaire unifié
const TEMP_DIR = path.join(process.cwd(), 'data', 'tmp');

/**
 * Assurer que le dossier temporaire existe
 */
function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
}

/**
 * Obtenir un chemin temporaire unique
 * @param {Object} options - Options
 * @param {string} options.ext - Extension du fichier (.png, .webp, etc.)
 * @param {string} options.prefix - Préfixe du nom de fichier
 * @returns {string} Chemin complet vers le fichier temporaire
 */
function getTempPath({ ext = '.tmp', prefix = 'temp' } = {}) {
    ensureTempDir();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    const fileName = `${prefix}_${timestamp}_${random}${ext}`;
    return path.join(TEMP_DIR, fileName);
}

/**
 * Créer un fichier temporaire avec du contenu
 * @param {Buffer} buffer - Contenu du fichier
 * @param {Object} options - Options (même que getTempPath)
 * @returns {string} Chemin du fichier créé
 */
function createTempFile(buffer, options = {}) {
    const filePath = getTempPath(options);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

/**
 * Nettoyer des fichiers temporaires
 * @param {string|Array<string>} filePaths - Chemin(s) des fichiers à supprimer
 */
function cleanup(filePaths) {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    
    paths.forEach(filePath => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🧹 Nettoyé: ${path.basename(filePath)}`);
            }
        } catch (error) {
            console.error(`❌ Erreur nettoyage ${filePath}:`, error.message);
        }
    });
}

/**
 * Nettoyer les anciens fichiers temporaires (plus de 1h)
 */
function cleanupOld() {
    try {
        ensureTempDir();
        const files = fs.readdirSync(TEMP_DIR);
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime.getTime() < oneHourAgo) {
                fs.unlinkSync(filePath);
                console.log(`🧹 Nettoyage auto: ${file}`);
            }
        });
    } catch (error) {
        console.error('❌ Erreur nettoyage automatique:', error.message);
    }
}

// Nettoyage automatique au démarrage et toutes les heures
ensureTempDir();
cleanupOld();
setInterval(cleanupOld, 60 * 60 * 1000); // 1 heure

module.exports = {
    ensureTempDir,
    getTempPath,
    createTempFile,
    cleanup,
    cleanupOld,
    TEMP_DIR
};