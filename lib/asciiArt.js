/**
 * wabot - A WhatsApp Bot
 * Copyright (c) 2024 wabot team
 * 
 * ASCII Art and Terminal UI designs for wabot
 */

const chalk = require('chalk');

/**
 * Get the main bot banner with dynamic name
 * @param {string} botName - The bot name to display
 * @param {boolean} mobileMode - Use mobile-friendly format
 * @returns {string} ASCII art banner
 */
function getBotBanner(botName = 'wabot', mobileMode = false) {
    if (mobileMode) {
        return `
${chalk.cyan('┌───────────────────────────┐')}
${chalk.cyan('│')} ${chalk.bold.magenta('🤖 WABOT')} ${chalk.cyan('│')}
${chalk.cyan('├───────────────────────────┤')}
${chalk.cyan('│')} ${chalk.yellow('WhatsApp Bot')} ${chalk.cyan('│')}
${chalk.cyan('│')} ${chalk.green('Ready to serve!')} ${chalk.cyan('│')}
${chalk.cyan('└───────────────────────────┘')}`;
    }
    
    return `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                                                           ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.bold.magenta('██╗    ██╗ █████╗ ██████╗  ██████╗ ████████╗')}        ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.bold.magenta('██║    ██║██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝')}        ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.bold.magenta('██║ █╗ ██║███████║██████╔╝██║   ██║   ██║')}           ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.bold.magenta('██║███╗██║██╔══██║██╔══██╗██║   ██║   ██║')}           ${chalk.cyan('║')}
${chalk.cyan('║')}     ${chalk.bold.magenta('╚███╔███╔╝██║  ██║██████╔╝╚██████╔╝   ██║')}           ${chalk.cyan('║')}
${chalk.cyan('║')}      ${chalk.bold.magenta('╚══╝╚══╝ ╚═╝  ╚═╝╚═════╝  ╚═════╝    ╚═╝')}           ${chalk.cyan('║')}
${chalk.cyan('║')}                                                           ${chalk.cyan('║')}
${chalk.cyan('║')}           ${chalk.yellow.bold('🤖 WhatsApp Bot par l\'équipe wabot 🤖')}          ${chalk.cyan('║')}
${chalk.cyan('║')}                                                           ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}`;
}

/**
 * Get connection success banner
 * @returns {string} ASCII art for successful connection
 */
function getConnectionBanner() {
    return `
${chalk.green('╔═══════════════════════════════════════════════════════════╗')}
${chalk.green('║')}                                                           ${chalk.green('║')}
${chalk.green('║')}    ${chalk.bold.green('✅ CONNEXION ÉTABLIE AVEC SUCCÈS ✅')}               ${chalk.green('║')}
${chalk.green('║')}                                                           ${chalk.green('║')}
${chalk.green('║')}         ${chalk.yellow('🌟 Bot en ligne et opérationnel 🌟')}              ${chalk.green('║')}
${chalk.green('║')}                                                           ${chalk.green('║')}
${chalk.green('╚═══════════════════════════════════════════════════════════╝')}`;
}

/**
 * Get pairing code display
 * @param {string} code - The pairing code
 * @param {boolean} mobileMode - Use mobile-friendly format
 * @returns {string} Formatted pairing code display
 */
function getPairingCodeDisplay(code, mobileMode = false) {
    if (mobileMode) {
        return `
${chalk.cyan('┌─────────────────────────┐')}
${chalk.cyan('│')} ${chalk.bold.yellow('🔐 CODE D\'APPARIEMENT')} ${chalk.cyan('│')}
${chalk.cyan('├─────────────────────────┤')}
${chalk.cyan('│')}    ${chalk.bold.white(code)}    ${chalk.cyan('│')}
${chalk.cyan('└─────────────────────────┘')}`;
    }
    
    return `
${chalk.bgBlue.white.bold('                                                             ')}
${chalk.bgBlue.white.bold('                 🔐 CODE D\'APPARIEMENT 🔐                   ')}
${chalk.bgBlue.white.bold('                                                             ')}
${chalk.bgBlue.white.bold(`                      ${code}                       `)}
${chalk.bgBlue.white.bold('                                                             ')}`;
}

/**
 * Get QR code prompt display
 * @returns {string} QR code instructions
 */
function getQRDisplay() {
    return `
${chalk.bgGreen.black.bold('                                                             ')}
${chalk.bgGreen.black.bold('                    📱 SCAN QR CODE 📱                      ')}
${chalk.bgGreen.black.bold('                                                             ')}
${chalk.bgGreen.black.bold('            Scannez le code QR avec WhatsApp               ')}
${chalk.bgGreen.black.bold('                                                             ')}`;
}

/**
 * Get bot info section
 * @param {Object} info - Bot information
 * @returns {string} Formatted bot info
 */
function getBotInfo(info = {}) {
    const {
        ytChannel = 'équipe wabot',
        github = 'wabot',
        waNumber = 'N/A',
        credit = 'équipe wabot'
    } = info;

    return `
${chalk.cyan('╔═══════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                     ${chalk.bold.white('INFORMATIONS BOT')}                    ${chalk.cyan('║')}
${chalk.cyan('╠═══════════════════════════════════════════════════════════╣')}
${chalk.cyan('║')} ${chalk.yellow('📺 CHAÎNE YT:')} ${chalk.white(ytChannel.padEnd(41))} ${chalk.cyan('║')}
${chalk.cyan('║')} ${chalk.yellow('💻 GITHUB:')} ${chalk.white(github.padEnd(44))} ${chalk.cyan('║')}
${chalk.cyan('║')} ${chalk.yellow('📱 NUMÉRO WA:')} ${chalk.white(waNumber.toString().padEnd(40))} ${chalk.cyan('║')}
${chalk.cyan('║')} ${chalk.yellow('👨‍💻 CRÉDIT:')} ${chalk.white(credit.padEnd(43))} ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════╝')}`;
}

/**
 * Get loading animation frame
 * @param {number} frame - Animation frame number
 * @returns {string} Loading animation
 */
function getLoadingAnimation(frame = 0) {
    const spinners = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinner = spinners[frame % spinners.length];
    
    return `${chalk.cyan(spinner)} ${chalk.yellow('Initialisation en cours...')}`;
}

/**
 * Get separator line
 * @param {string} color - Chalk color name
 * @returns {string} Separator line
 */
function getSeparator(color = 'cyan') {
    return chalk[color]('═══════════════════════════════════════════════════════════');
}

/**
 * Get a simple box around text
 * @param {string} text - Text to box
 * @param {string} color - Box color
 * @returns {string} Boxed text
 */
function getTextBox(text, color = 'cyan') {
    const lines = text.split('\n');
    const maxLength = Math.max(...lines.map(line => line.length));
    const paddedLines = lines.map(line => line.padEnd(maxLength));
    
    let result = chalk[color]('╔' + '═'.repeat(maxLength + 2) + '╗') + '\n';
    paddedLines.forEach(line => {
        result += chalk[color]('║ ') + line + chalk[color](' ║') + '\n';
    });
    result += chalk[color]('╚' + '═'.repeat(maxLength + 2) + '╝');
    
    return result;
}

module.exports = {
    getBotBanner,
    getConnectionBanner,
    getPairingCodeDisplay,
    getQRDisplay,
    getBotInfo,
    getLoadingAnimation,
    getSeparator,
    getTextBox
};