const fetch = require('node-fetch');
const FormData = require('form-data');
const FileType = require('file-type');
const fs = require('fs');
const path = require('path');
const temp = require('./temp');

/**
 * Upload file to qu.ax
 * Supported mimetypes:
 * - `image/jpeg`
 * - `image/jpg`
 * - `image/png`
 * @param {Buffer} buffer File Buffer
 * @return {Promise<string>}
 */
async function uploadImage(buffer) {
    try {
        // Get file type
        const fileType = await FileType.fromBuffer(buffer);
        const { ext, mime } = fileType || { ext: 'png', mime: 'image/png' };
        const tempFile = temp.getTempPath({ ext: `.${ext}`, prefix: 'upload' });

        // Save buffer to temp file
        fs.writeFileSync(tempFile, buffer);

        // Create form data
        const form = new FormData();
        form.append('files[]', fs.createReadStream(tempFile));

        // Upload to qu.ax
        const response = await fetch('https://qu.ax/upload.php', {
            method: 'POST',
            body: form,
            headers: form.getHeaders()
        });

        // Clean up temp file
        temp.cleanup(tempFile);

        const result = await response.json();
        if (result && result.success) {
            return result.files[0].url;
        } else {
            // Fallback to telegraph if qu.ax fails
            const telegraphForm = new FormData();
            telegraphForm.append('file', buffer, {
                filename: `upload.${ext}`,
                contentType: mime
            });

            const telegraphResponse = await fetch('https://telegra.ph/upload', {
                method: 'POST',
                body: telegraphForm
            });

            const img = await telegraphResponse.json();
            if (img[0]?.src) {
                return 'https://telegra.ph' + img[0].src;
            }
            
            throw new Error('Failed to upload image to both services');
        }
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

module.exports = { uploadImage };

/**
 * Alternative upload to telegra.ph (backup)
 */
/*
async function uploadImageTelegraph(buffer) {
    try {
        const { ext, mime } = await fileTypeFromBuffer(buffer);
        const form = new FormData();
        const blob = new Blob([buffer.toArrayBuffer()], { type: mime });
        form.append('file', blob, 'tmp.' + ext);

        const response = await fetch('https://telegra.ph/upload', {
            method: 'POST',
            body: form
        });

        const img = await response.json();
        if (img.error) throw img.error;
        return 'https://telegra.ph' + img[0].src;
    } catch (error) {
        throw error;
    }
}
*/ 