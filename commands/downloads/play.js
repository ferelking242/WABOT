const yts    = require('yt-search');
const axios  = require('axios');
const crypto = require('crypto');

// ─── Savetube helper ──────────────────────────────────────────────────────────
const savetube = {
  headers: {
    'accept':          '*/*',
    'content-type':    'application/json',
    'origin':          'https://yt.savetube.me',
    'referer':         'https://yt.savetube.me/',
    'accept-language': 'en-US,en;q=0.9',
    'user-agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  },

  decrypt: async (enc) => {
    const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
    const data      = Buffer.from(enc, 'base64');
    const iv        = data.slice(0, 16);
    const content   = data.slice(16);
    const matches   = secretKey.match(/.{1,2}/g);
    const key       = Buffer.from(matches.join(''), 'hex');
    const decipher  = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let decrypted   = decipher.update(content);
    decrypted       = Buffer.concat([decrypted, decipher.final()]);
    return JSON.parse(decrypted.toString());
  },

  download: async (videoUrl) => {
    const { data: cdnData } = await axios.get(
      'https://media.savetube.me/api/random-cdn',
      { headers: savetube.headers, timeout: 10000 }
    );
    const cdn = cdnData.cdn;

    const { data: infoData } = await axios.post(
      `https://${cdn}/v2/info`,
      { url: videoUrl },
      { headers: savetube.headers, timeout: 15000 }
    );
    if (!infoData.status) throw new Error('Savetube info failed');
    const info = await savetube.decrypt(infoData.data);

    const { data: dlData } = await axios.post(
      `https://${cdn}/download`,
      { downloadType: 'mp3', id: info.id, quality: 'mp3' },
      { headers: savetube.headers, timeout: 20000 }
    );
    if (!dlData.status) throw new Error('Savetube download failed');
    const result = await savetube.decrypt(dlData.data);
    return { downloadUrl: result.downloadUrl, title: info.title || 'audio' };
  },
};

// ─── Fallback : Keith API ─────────────────────────────────────────────────────
async function tryKeith(videoUrl) {
  const res = await axios.get(
    `https://apis-keith.vercel.app/download/dlmp3?url=${encodeURIComponent(videoUrl)}`,
    { timeout: 20000 }
  );
  const d = res.data;
  if (!d?.status || !d?.result?.downloadUrl) throw new Error('Keith: no downloadUrl');
  return { downloadUrl: d.result.downloadUrl, title: d.result.title || 'audio' };
}

// ─── Fallback : PrinceTech ────────────────────────────────────────────────────
async function tryPrince(videoUrl) {
  const apikey = process.env.PRINCE_API_KEY || 'prince';
  const params = new URLSearchParams({ apikey, url: videoUrl });
  const { data } = await axios.get(
    `https://api.princetechn.com/api/download/ytmp3?${params}`,
    { timeout: 20000 }
  );
  if (!data?.download_url) throw new Error('PrinceTech: no download_url');
  return { downloadUrl: data.download_url, title: data.title || 'audio' };
}

// ─── Commande principale ──────────────────────────────────────────────────────
async function playCommand(sock, chatId, message) {
  try {
    const text = message.message?.conversation
              || message.message?.extendedTextMessage?.text
              || '';
    const searchQuery = text.split(' ').slice(1).join(' ').trim();

    if (!searchQuery) {
      return await sock.sendMessage(chatId, {
        text: '🎵 Envoie le nom ou l\'URL de la chanson :\n`.music <titre ou URL YouTube>`',
      });
    }

    // Recherche YouTube
    const { videos } = await yts(searchQuery);
    if (!videos || videos.length === 0) {
      return await sock.sendMessage(chatId, { text: '❌ Aucune chanson trouvée pour : ' + searchQuery });
    }

    const video    = videos[0];
    const urlYt    = video.url;
    const title    = video.title   || searchQuery;
    const duration = video.timestamp || '?';

    await sock.sendMessage(chatId, {
      text: `🎵 *${title}* (${duration})\n⏳ Téléchargement en cours…`,
    });

    // Essaie les APIs dans l'ordre — s'arrête dès qu'une réussit
    let result = null;
    const tries = [
      { name: 'Savetube', fn: () => savetube.download(urlYt) },
      { name: 'Keith',    fn: () => tryKeith(urlYt)           },
      { name: 'Prince',   fn: () => tryPrince(urlYt)          },
    ];

    for (const t of tries) {
      try {
        result = await t.fn();
        console.log(`[playCommand] ✅ ${t.name} réussi`);
        break;
      } catch (err) {
        console.warn(`[playCommand] ⚠️ ${t.name} échoué:`, err.message);
      }
    }

    if (!result?.downloadUrl) {
      return await sock.sendMessage(chatId, {
        text: '❌ Téléchargement impossible. Toutes les sources ont échoué.\nEssaie la commande `.play` ou réessaie dans quelques instants.',
      });
    }

    await sock.sendMessage(chatId, {
      audio:    { url: result.downloadUrl },
      mimetype: 'audio/mpeg',
      fileName: `${result.title}.mp3`,
      ptt:      false,
    }, { quoted: message });

  } catch (error) {
    console.error('[playCommand] Erreur inattendue:', error);
    await sock.sendMessage(chatId, {
      text: '❌ Une erreur est survenue. Réessaie plus tard.',
    });
  }
}

module.exports = playCommand;
