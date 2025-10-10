const axios = require('axios');
const { i18n } = require('../lib/i18n');
const { getUserLanguage } = require('../lib/languages');

module.exports = async function (sock, chatId, city, message) {
    const senderId = message?.key?.participant || message?.key?.remoteJid || chatId;
    const userLang = getUserLanguage(senderId);
    
    try {
        const apiKey = process.env.OPENWEATHER_API_KEY || ''; // Load from environment
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric&lang=${userLang}`);
        const weather = response.data;
        
        // Créer le message météo avec i18n
        const weatherTitle = i18n.t(senderId, 'messages.weather_title', { city: weather.name });
        const weatherTemp = i18n.t(senderId, 'messages.weather_temp', { temp: weather.main.temp });
        const weatherDesc = i18n.t(senderId, 'messages.weather_desc', { desc: weather.weather[0].description });
        const weatherHumidity = i18n.t(senderId, 'messages.weather_humidity', { humidity: weather.main.humidity });
        const weatherPressure = i18n.t(senderId, 'messages.weather_pressure', { pressure: weather.main.pressure });
        
        const weatherText = `${weatherTitle}\n\n${weatherTemp}\n${weatherDesc}\n${weatherHumidity}\n${weatherPressure}`;
        
        await sock.sendMessage(chatId, { text: weatherText });
    } catch (error) {
        console.error('Error fetching weather:', error);
        let errorMsg;
        if (error.response && error.response.status === 404) {
            errorMsg = i18n.t(senderId, 'messages.weather_not_found');
        } else {
            errorMsg = i18n.t(senderId, 'messages.failed_to_fetch');
        }
        await sock.sendMessage(chatId, { text: errorMsg });
    }
};
