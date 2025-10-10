/**
 * Module pour exposer l'instance WhatsApp globale
 * Permet aux autres modules (API server) d'accéder à la connexion WhatsApp
 */

let whatsappInstance = null;

function setWhatsAppInstance(instance) {
    whatsappInstance = instance;
    console.log('✅ Instance WhatsApp enregistrée globalement');
}

function getWhatsAppInstance() {
    return whatsappInstance;
}

function isWhatsAppConnected() {
    return whatsappInstance !== null && whatsappInstance.user !== null;
}

module.exports = {
    setWhatsAppInstance,
    getWhatsAppInstance,
    isWhatsAppConnected
};
