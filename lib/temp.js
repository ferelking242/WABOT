/**
 * Utilitaire centralisé pour la gestion des fichiers temporaires
 * Corrige le chaos temp/tmp avec une API unifiée
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// FIX CRITIQUE ANDROID : process.cwd() vaut '/data' sur Android → EACCES
// On utilise os.tmpdir() (ex: /data/user/0/.../cache ou /tmp sur Linux)
// avec fallback sur __dirname/../data/tmp si os.tmpdir() n'est pas accessible
function resolveWritableTempDir() {
    const candidates = [
        process.env.WABOT_TEMP_DIR,
        path.join(os.tmpdir(), 'wabot-tmp'),
        path.join(__dirname, '..', 'data', 'tmp'),
        path.join(__dirname, '..', 'tmp'),
    ].filter(Boolean);

    for (const dir of candidates) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            // Test write access
            const testFile = path.join(dir, '.write_test');
            fs.writeFileSync(testFile, '1');
            fs.unlinkSync(testFile);
            return dir;
        } catch {
            // Try next candidate
        }
    }
    // Last resort: in-memory fallback path (will still fail but gracefully)
    return path.join(os.tmpdir(), 'wabot-tmp');
}

const TEMP_DIR = resolveWritableTempDir();

/**
 * Assurer que le dossier temporaire existe
 */
function ensureTempDir() {
    if (!fs.existsSync(TEMP_DIR)) {
        try {
            fs.mkdirSync(TEMP_DIR, { recursive: true });
        } catch (e) {
            console.warn('⚠️ Cannot create temp dir:', e.message);
        }
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
            try {
                const stats = fs.statSync(filePath);
                if (stats.mtime.getTime() < oneHourAgo) {
                    fs.unlinkSync(filePath);
                    console.log(`🧹 Nettoyage auto: ${file}`);
                }
            } catch {}
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
