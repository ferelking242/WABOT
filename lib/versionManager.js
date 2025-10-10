/**
 * Version Manager - Système de gestion des versions via GitHub API
 * Gère les mises à jour, changelogs et rollbacks
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const settings = require('../config/settings');

class VersionManager {
    constructor() {
        this.currentVersion = settings.version;
        // Configuration GitHub depuis settings.js avec fallback
        this.githubRepo = settings.github?.repo || null;
        this.githubOwner = settings.github?.owner || null;
        this.githubToken = process.env.GITHUB_TOKEN || settings.github?.token || null;
        this.apiCache = new Map(); // Cache pour éviter trop d'appels API
        this.cacheTimeout = 300000; // 5 minutes
        // Validation regex pour les versions sémantiques
        this.VERSION_REGEX = /^v?([0-9]+)\.([0-9]+)\.([0-9]+)(-[a-zA-Z0-9-]+)?$/;
    }

    /**
     * Configure le repository GitHub
     */
    setRepository(owner, repo) {
        this.githubOwner = owner;
        this.githubRepo = repo;
    }

    /**
     * Exécute une commande shell de manière asynchrone
     */
    runCommand(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
                if (err) return reject(new Error((stderr || stdout || err.message || '').toString()));
                resolve((stdout || '').toString());
            });
        });
    }

    /**
     * Vérifie si c'est un dépôt Git
     */
    async hasGitRepo() {
        const gitDir = path.join(process.cwd(), '.git');
        if (!fs.existsSync(gitDir)) return false;
        try {
            await this.runCommand('git --version');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Récupère l'URL du repository GitHub depuis git remote
     */
    async getGitHubRepoFromRemote() {
        try {
            const remoteUrl = (await this.runCommand('git remote get-url origin')).trim();
            
            // Parse GitHub URL (ssh ou https)
            const sshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+)\.git$/);
            const httpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/(.+)\.git$/);
            
            if (sshMatch) {
                return { owner: sshMatch[1], repo: sshMatch[2] };
            } else if (httpsMatch) {
                return { owner: httpsMatch[1], repo: httpsMatch[2] };
            }
            
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Effectue un appel à l'API GitHub avec cache
     */
    async githubApiCall(endpoint) {
        const cacheKey = `github_${endpoint}`;
        const cached = this.apiCache.get(cacheKey);
        
        if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
            return cached.data;
        }

        try {
            // Auto-détection du repo si pas configuré
            if (!this.githubRepo || !this.githubOwner) {
                const repoInfo = await this.getGitHubRepoFromRemote();
                if (repoInfo) {
                    this.setRepository(repoInfo.owner, repoInfo.repo);
                } else {
                    throw new Error('Repository GitHub non configuré et impossible à détecter. Configurez settings.github.owner et settings.github.repo');
                }
            }

            const url = `https://api.github.com/repos/${this.githubOwner}/${this.githubRepo}/${endpoint}`;
            console.log(`📡 API GitHub: ${url}`);
            
            // Préparer les headers avec authentification optionnelle
            const headers = {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'wabot-updater/1.0'
            };
            
            // Ajouter le token d'authentification si disponible
            if (this.githubToken) {
                headers['Authorization'] = `token ${this.githubToken}`;
                console.log('🔑 Authentification GitHub activée (rate limits augmentés)');
            } else {
                console.log('⚠️ Pas de token GitHub - rate limits réduits (60 req/h)');
            }
            
            const response = await axios.get(url, {
                timeout: 10000,
                headers
            });

            // Cache la réponse
            this.apiCache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            return response.data;
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const message = error.response.data?.message || 'Erreur inconnue';
                
                if (status === 403 && message.includes('rate limit')) {
                    throw new Error(`Rate limit GitHub atteint. ${this.githubToken ? 'Vérifiez votre token' : 'Configurez GITHUB_TOKEN pour augmenter les limites'}`);
                }
                
                throw new Error(`Erreur API GitHub ${status}: ${message}`);
            } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                throw new Error('Impossible de contacter GitHub. Vérifiez votre connexion internet.');
            } else {
                throw new Error(`Erreur API GitHub: ${error.message}`);
            }
        }
    }

    /**
     * Compare deux versions semver
     */
    compareVersions(version1, version2) {
        const normalize = (v) => {
            return v.replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
        };

        const v1 = normalize(version1);
        const v2 = normalize(version2);

        for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
            const a = v1[i] || 0;
            const b = v2[i] || 0;
            if (a > b) return 1;
            if (a < b) return -1;
        }
        return 0;
    }

    /**
     * Vérifie s'il y a une nouvelle version disponible
     */
    async checkForUpdates() {
        try {
            const release = await this.githubApiCall('releases/latest');
            const latestVersion = release.tag_name.replace(/^v/, '');
            const currentVersion = this.currentVersion.replace(/^v/, '');

            const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0;

            return {
                hasUpdate,
                currentVersion: this.currentVersion,
                latestVersion: release.tag_name,
                releaseInfo: {
                    name: release.name,
                    body: release.body,
                    publishedAt: release.published_at,
                    downloadUrl: release.tarball_url,
                    htmlUrl: release.html_url
                }
            };
        } catch (error) {
            throw new Error(`Impossible de vérifier les mises à jour: ${error.message}`);
        }
    }

    /**
     * Récupère toutes les releases disponibles
     */
    async getAllReleases() {
        try {
            const releases = await this.githubApiCall('releases');
            return releases.map(release => ({
                version: release.tag_name,
                name: release.name,
                body: release.body,
                publishedAt: release.published_at,
                isPrerelease: release.prerelease,
                htmlUrl: release.html_url
            }));
        } catch (error) {
            throw new Error(`Impossible de récupérer les releases: ${error.message}`);
        }
    }

    /**
     * Valide le format d'une version sémantique
     */
    validateVersionFormat(version) {
        if (!version || typeof version !== 'string') {
            return false;
        }
        
        // Nettoyer et vérifier le format
        const cleanVersion = version.trim();
        if (cleanVersion.length > 50) { // Limite raisonnable
            return false;
        }
        
        return this.VERSION_REGEX.test(cleanVersion);
    }

    /**
     * Nettoie et valide une version utilisateur
     */
    sanitizeVersion(version) {
        if (!this.validateVersionFormat(version)) {
            throw new Error(`Format de version invalide: ${version}. Utilisez le format v1.2.3 ou 1.2.3`);
        }
        
        const cleanVersion = version.trim();
        return cleanVersion.startsWith('v') ? cleanVersion : `v${cleanVersion}`;
    }

    /**
     * Récupère les informations d'une version spécifique
     */
    async getReleaseInfo(version) {
        try {
            // Validation stricte de la version avant utilisation
            const tagName = this.sanitizeVersion(version);
            const release = await this.githubApiCall(`releases/tags/${tagName}`);
            
            return {
                version: release.tag_name,
                name: release.name,
                body: release.body,
                publishedAt: release.published_at,
                isPrerelease: release.prerelease,
                htmlUrl: release.html_url
            };
        } catch (error) {
            throw new Error(`Version ${version} non trouvée: ${error.message}`);
        }
    }

    /**
     * Récupère le changelog formaté
     */
    formatChangelog(releaseBody, version) {
        if (!releaseBody) return `Aucun changelog disponible pour la version ${version}`;

        // Formatage basique du markdown vers WhatsApp
        let formatted = releaseBody
            .replace(/#{1,6}\s*/g, '*')  // Headers en gras
            .replace(/\*\*(.*?)\*\*/g, '*$1*')  // Bold
            .replace(/\*(.*?)\*/g, '_$1_')  // Italic  
            .replace(/`(.*?)`/g, '```$1```')  // Code
            .replace(/\[(.*?)\]\(.*?\)/g, '$1'); // Links

        return `🔄 *Changelog ${version}*\n\n${formatted}`;
    }

    /**
     * Valide un hash Git SHA
     */
    validateGitSha(sha) {
        if (!sha || typeof sha !== 'string') {
            return false;
        }
        // Hash Git : 40 caractères hexadécimaux
        return /^[a-f0-9]{7,40}$/i.test(sha.trim());
    }

    /**
     * Effectue la mise à jour via Git
     */
    async updateViaGit() {
        try {
            console.log('📥 Récupération des dernières modifications...');
            const oldRev = (await this.runCommand('git rev-parse HEAD').catch(() => 'unknown')).trim();
            
            await this.runCommand('git fetch --all --prune');
            const newRev = (await this.runCommand('git rev-parse origin/main')).trim();
            const alreadyUpToDate = oldRev === newRev;
            
            if (alreadyUpToDate) {
                return { alreadyUpToDate: true, version: newRev.substring(0, 8) };
            }

            // Validation des hashes Git avant utilisation dans les commandes
            if (!this.validateGitSha(oldRev) || !this.validateGitSha(newRev)) {
                throw new Error('Hashes Git invalides détectés');
            }

            // Récupérer les informations sur les changements (avec validation)
            const commits = await this.runCommand(`git log --pretty=format:"%h %s (%an)" ${oldRev}..${newRev}`).catch(() => '');
            const files = await this.runCommand(`git diff --name-status ${oldRev} ${newRev}`).catch(() => '');
            
            console.log('🔄 Application des changements...');
            await this.runCommand(`git reset --hard ${newRev}`);
            await this.runCommand('git clean -fd');
            
            console.log('📦 Installation des dépendances...');
            await this.runCommand('npm install --no-audit --no-fund');
            
            return {
                success: true,
                oldRev: oldRev.substring(0, 8),
                newRev: newRev.substring(0, 8),
                commits,
                files,
                alreadyUpToDate: false
            };
        } catch (error) {
            throw new Error(`Échec de la mise à jour Git: ${error.message}`);
        }
    }

    /**
     * Effectue un rollback vers une version précédente
     */
    async rollbackToVersion(version) {
        try {
            if (!await this.hasGitRepo()) {
                throw new Error('Le rollback nécessite un dépôt Git');
            }

            // Normaliser le format de la version
            const tagName = version.startsWith('v') ? version : `v${version}`;
            
            console.log(`🔄 Rollback vers ${tagName}...`);
            
            // Vérifier que le tag existe
            await this.runCommand(`git rev-parse ${tagName}`);
            
            // Sauvegarder la version actuelle
            const currentRev = (await this.runCommand('git rev-parse HEAD')).trim();
            
            // Effectuer le rollback
            await this.runCommand(`git checkout ${tagName}`);
            await this.runCommand('npm install --no-audit --no-fund');
            
            return {
                success: true,
                previousVersion: currentRev.substring(0, 8),
                newVersion: tagName,
                message: `Rollback vers ${tagName} effectué avec succès`
            };
        } catch (error) {
            throw new Error(`Échec du rollback: ${error.message}`);
        }
    }

    /**
     * Sauvegarde l'état actuel avant mise à jour
     */
    async createBackup() {
        try {
            if (!await this.hasGitRepo()) return null;
            
            const currentRev = (await this.runCommand('git rev-parse HEAD')).trim();
            const branchName = `backup-${Date.now()}`;
            
            await this.runCommand(`git branch ${branchName}`);
            
            return {
                backupBranch: branchName,
                commit: currentRev.substring(0, 8)
            };
        } catch (error) {
            console.warn('Impossible de créer une sauvegarde:', error.message);
            return null;
        }
    }

    /**
     * Nettoie le cache API
     */
    clearCache() {
        this.apiCache.clear();
    }
}

// Instance singleton
const versionManager = new VersionManager();

module.exports = versionManager;