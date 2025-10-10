# 🤖 Wabot - Bot WhatsApp Multilingue avec IA

<div align="center">

![Version](https://img.shields.io/badge/version-3.2-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

**Bot WhatsApp intelligent et multilingue avec plus de 130+ commandes, IA intégrée et système de permissions avancé**

[Fonctionnalités](#-fonctionnalités) • [Installation](#-installation) • [Configuration](#-configuration) • [Déploiement](#-déploiement) • [Commandes](#-commandes)

</div>

---

## 📋 Table des Matières

- [🌟 Fonctionnalités](#-fonctionnalités)
- [🚀 Installation Rapide](#-installation-rapide)
- [⚙️ Configuration](#️-configuration)
- [🔑 Variables d'Environnement](#-variables-denvironnement)
- [📦 Déploiement](#-déploiement)
- [🎯 Commandes Disponibles](#-commandes-disponibles)
- [🌍 Langues Supportées](#-langues-supportées)
- [🛠️ Structure du Projet](#️-structure-du-projet)
- [🤝 Support](#-support)

---

## 🌟 Fonctionnalités

### 🎨 Core Features

- ✅ **130+ Commandes** - Administration, jeux, médias, IA, utilitaires
- 🌍 **19 Langues** - Support multilingue complet (FR, EN, AR, ES, PT, etc.)
- 🤖 **IA Intégrée** - Réponses intelligentes avec Serena AI
- 👥 **Système de Permissions** - Owner, Sudo, Admin, Companion
- 🔒 **Sécurité Avancée** - Anti-spam, anti-raid, anti-badword, anti-link
- 📊 **Analytics** - Statistiques détaillées des groupes et utilisateurs
- 🎮 **Mini-Jeux** - BlackJack, TicTacToe, Trivia, Hangman, etc.
- 📥 **Téléchargement** - YouTube, TikTok, Instagram, Facebook
- 🎨 **Médias** - Stickers, images, GIF, text-to-speech
- 💬 **Communautés WhatsApp** - Gestion complète des communautés

### 🔥 Features Avancées

- **Companion System** - Gestion multi-bots avec sessions isolées
- **Auto-Modération** - Système automatique de modération des groupes
- **Cache Intelligent** - Optimisation des performances avec cache distribué
- **Rate Limiting** - Protection contre le spam et les abus
- **Gestion des médias** - Upload, compression, conversion automatique
- **Système de logs** - Traçabilité complète des actions
- **Backup automatique** - Sauvegarde des sessions et données

---

## 🚀 Installation Rapide

### Prérequis

- **Node.js** v18+ ([Télécharger](https://nodejs.org/))
- **PostgreSQL** ou **Supabase** (recommandé)
- **Git** ([Télécharger](https://git-scm.com/))
- Numéro WhatsApp dédié au bot

### 1. Cloner le Repository

```bash
git clone https://github.com/ferelking242/wabot.git
cd wabot
```

### 2. Installer les Dépendances

```bash
npm install
```

### 3. Configuration Initiale

Créez un fichier `.env` à la racine :

```bash
cp .env.example .env
nano .env
```

Ou utilisez le script de configuration :

```bash
npm run setup
```

---

## ⚙️ Configuration

### 🔑 Variables d'Environnement

Créez un fichier `.env` avec les informations suivantes :

```env
# ================================
# Supabase Configuration (Recommandé)
# ================================
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_anon_key
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key

# ================================
# Database Connection URLs
# ================================
DATABASE_URL=postgresql://user:password@host:port/database
DATABASE_URL_TRANSACTION=postgresql://user:password@host:port/database
DATABASE_URL_SESSION=postgresql://user:password@host:port/database

# ================================
# Database Credentials (Alternative)
# ================================
DB_HOST=db.votre-projet.supabase.co
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=votre_mot_de_passe
DB_NAME=postgres

# ================================
# WhatsApp Bot Configuration
# ================================
OWNER_NUMBER=242065491040          # Votre numéro WhatsApp (sans +)
BOT_PHONE_NUMBER=242061194809      # Numéro du bot (sans +)
WHATSAPP_CONNECTION_MODE=pairing   # Mode: "pairing" ou "qr"
BOT_NAME=Wabot                     # Nom du bot
THEME_EMOJI=•                      # Emoji thème

# ================================
# GitHub (Mises à jour automatiques)
# ================================
GITHUB_OWNER=votre-username
GITHUB_REPO=wabot
GITHUB_TOKEN=ghp_votre_token

# ================================
# Environment
# ================================
NODE_ENV=production
PORT=3000
```

### 📚 Obtenir les Credentials

#### Supabase (Recommandé)

1. Créez un compte sur [Supabase](https://supabase.com)
2. Créez un nouveau projet
3. Allez dans **Settings** → **API**
4. Copiez :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` → `SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

#### Database URL

Format PostgreSQL :
```
postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
```

Exemple Supabase :
```
postgresql://postgres.xxx:password@aws-1-eu-north-1.pooler.supabase.com:6543/postgres
```

#### GitHub Token

1. Allez sur [GitHub Tokens](https://github.com/settings/tokens)
2. **Generate new token (classic)**
3. Cochez : `repo` (full control)
4. Copiez le token dans `GITHUB_TOKEN`

---

## 📦 Déploiement

### 🔷 Déploiement sur Replit

1. **Fork sur Replit**
   ```
   https://replit.com/github/ferelking242/wabot
   ```

2. **Configurer Secrets**
   - Ouvrez le panneau **Secrets** (🔒)
   - Ajoutez toutes les variables du `.env`

3. **Exécuter**
   ```bash
   npm start
   ```

### 🔷 Déploiement sur Render

1. **Créer un nouveau Web Service**
   - Repository: `https://github.com/ferelking242/wabot`
   - Branch: `main`

2. **Configuration**
   - Build Command: `npm install`
   - Start Command: `node index.js`

3. **Variables d'environnement**
   - Ajoutez toutes les variables du `.env`

4. **Déployer** ✅

### 🔷 Déploiement sur Railway

1. **Deploy from GitHub**
   ```bash
   railway login
   railway link
   railway up
   ```

2. **Variables**
   ```bash
   railway variables set SUPABASE_URL=xxx
   railway variables set OWNER_NUMBER=xxx
   # ... etc
   ```

### 🔷 Déploiement sur VPS (Linux)

```bash
# 1. Cloner le projet
git clone https://github.com/ferelking242/wabot.git
cd wabot

# 2. Installer les dépendances
npm install

# 3. Configurer .env
nano .env

# 4. Initialiser la base de données
npm run init-db

# 5. Lancer le bot
npm start

# 6. Utiliser PM2 (optionnel)
npm install -g pm2
pm2 start index.js --name wabot
pm2 save
pm2 startup
```

---

## 🎯 Commandes Disponibles

### 📌 Administration

| Commande | Description | Permissions |
|----------|-------------|-------------|
| `.ban` | Bannir un utilisateur | Admin |
| `.kick` | Expulser un membre | Admin |
| `.warn` | Avertir un membre | Admin |
| `.mute` | Rendre muet un membre | Admin |
| `.antilink` | Activer/désactiver anti-lien | Admin |
| `.antibadword` | Activer/désactiver anti-gros-mots | Admin |
| `.poll` | Créer un sondage | Admin |
| `.slowmode` | Activer le mode lent | Admin |

### 🤖 Intelligence Artificielle

| Commande | Description |
|----------|-------------|
| `.ai <question>` | Poser une question à l'IA |
| `.imagine <prompt>` | Générer une image avec IA |
| `.serena-activate` | Activer l'assistant Serena |
| `.serena-analyze` | Analyser un produit |

### 🎮 Jeux

| Commande | Description |
|----------|-------------|
| `.blackjack` | Jouer au BlackJack |
| `.tictactoe @user` | Jouer au Morpion |
| `.trivia` | Quiz de culture générale |
| `.hangman` | Jeu du pendu |
| `.roulette` | Roulette russe |

### 📥 Téléchargement

| Commande | Description |
|----------|-------------|
| `.play <recherche>` | Télécharger audio YouTube |
| `.video <recherche>` | Télécharger vidéo YouTube |
| `.tiktok <url>` | Télécharger TikTok |
| `.instagram <url>` | Télécharger Instagram |
| `.facebook <url>` | Télécharger Facebook |

### 🎨 Médias

| Commande | Description |
|----------|-------------|
| `.sticker` | Créer un sticker |
| `.attp <texte>` | Texte animé |
| `.tts <texte>` | Text-to-Speech |
| `.transcribe` | Transcrire audio en texte |
| `.removebg` | Supprimer l'arrière-plan |
| `.remini` | Améliorer la qualité d'image |

### 🔧 Utilitaires

| Commande | Description |
|----------|-------------|
| `.translate <texte>` | Traduire un texte |
| `.weather <ville>` | Météo d'une ville |
| `.github <repo>` | Infos GitHub repo |
| `.lyrics <chanson>` | Paroles d'une chanson |
| `.language <code>` | Changer la langue |

### 🔒 Owner Only

| Commande | Description |
|----------|-------------|
| `.sudo` | Gérer les sudos |
| `.update` | Mettre à jour le bot |
| `.test` | Tester les commandes |
| `.companion` | Gérer les companions |

---

## 🌍 Langues Supportées

Le bot supporte **19 langues** :

| Code | Langue | Code | Langue |
|------|--------|------|--------|
| 🇫🇷 `fr` | Français | 🇬🇧 `en` | English |
| 🇸🇦 `ar` | العربية | 🇪🇸 `es` | Español |
| 🇵🇹 `pt` | Português | 🇿🇦 `af` | Afrikaans |
| 🇪🇹 `am` | አማርኛ | 🇲🇱 `bm` | Bamanan |
| 🇸🇳 `ff` | Fulfulde | 🇳🇬 `ha` | Hausa |
| 🇳🇬 `ig` | Igbo | 🇨🇩 `ln` | Lingala |
| 🇰🇪 `sw` | Swahili | 🇳🇬 `yo` | Yoruba |
| 🇿🇼 `sn` | Shona | 🇿🇦 `zu` | Zulu |
| 🇿🇦 `xh` | Xhosa | 🇨🇩 `mkw` | Kituba |
| 🇸🇳 `wo` | Wolof |

**Changer la langue :**
```
.language fr
.language en
```

---

## 🛠️ Structure du Projet

```
wabot/
├── commands/           # Toutes les commandes du bot
│   ├── admin/         # Commandes admin
│   ├── ai/            # Commandes IA
│   ├── games/         # Mini-jeux
│   ├── downloads/     # Téléchargements
│   ├── media/         # Médias (stickers, images)
│   ├── utilities/     # Utilitaires
│   └── system/        # Commandes système
├── lib/               # Bibliothèques et utilitaires
│   ├── database.js    # Gestion base de données
│   ├── commandHandler.js
│   ├── i18n.js        # Internationalisation
│   └── whatsapp-connection.js
├── config/            # Configuration
│   ├── config.js
│   └── settings.js
├── locales/           # Traductions (19 langues)
├── serena-assistant/  # Assistant IA Serena
├── scripts/           # Scripts de setup
├── index.js           # Point d'entrée
└── main.js            # Gestionnaire de messages
```

---

## 🔄 Mises à Jour

### Mettre à jour le bot

```bash
# Via commande WhatsApp (Owner only)
.update

# Ou manuellement
git pull origin main
npm install
npm restart
```

---

## 🐛 Debug & Logs

### Activer les logs détaillés

Dans `.env` :
```env
NODE_ENV=development
DEBUG=true
```

### Fichiers de logs

```
data/logs/
├── commands/     # Logs des commandes
├── errors/       # Logs d'erreurs
└── system/       # Logs système
```

### Tester le bot

```bash
# Tests automatisés
npm run test

# Via WhatsApp (Owner)
.test status
.test quick
.test full
```

---

## 📊 Base de Données

### Initialiser les tables

```bash
npm run init-db
```

### Tables principales

- `user_groups` - Groupes et membres
- `bot_status` - Statut du bot
- `commands_usage` - Statistiques des commandes
- `group_links` - Liens des groupes
- `companions` - Système companion
- `user_profiles` - Profils utilisateurs

### Migrations

```bash
npm run migrate
```

---

## 🤝 Support

### 📧 Contact

- **GitHub Issues** : [Signaler un bug](https://github.com/ferelking242/wabot/issues)
- **Discussions** : [Forum](https://github.com/ferelking242/wabot/discussions)

### 📚 Documentation

- **Dashboard** : [wabot-web](https://github.com/ferelking242/wabot-web)
- **API Docs** : [Documentation complète](#)

### ⭐ Contribuer

Les contributions sont les bienvenues !

1. Fork le projet
2. Créez une branche (`git checkout -b feature/AmazingFeature`)
3. Commit (`git commit -m 'Add AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

---

## 📜 License

Ce projet est sous licence **MIT** - voir le fichier [LICENSE](LICENSE) pour plus de détails.

---

## 🙏 Remerciements

- [Baileys](https://github.com/WhiskeySockets/Baileys) - Library WhatsApp
- [Supabase](https://supabase.com) - Base de données
- Tous les contributeurs et utilisateurs

---

<div align="center">

**Fait avec ❤️ par [FERELKING242](https://github.com/ferelking242)**

⭐ N'oubliez pas de mettre une étoile si ce projet vous plaît !

</div>
