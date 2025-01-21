const fs = require('fs-extra');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();
const config = require('./config');

const s3 = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: 'ru-1',
    credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY
    }
});

// Функция для загрузки файла в S3
async function uploadToS3(filePath, fileName) {
    try {
        const fileContent = await fs.readFile(filePath);

        const s3Params = {
            Bucket: config.S3_BUCKET,
            Key: `tg_images/${fileName}`,
            Body: fileContent,
            ACL: 'public-read'
        };

        const command = new PutObjectCommand(s3Params);
        const uploadResult = await s3.send(command);

        //console.log(`Файл успешно загружен в S3: ${uploadResult.Location}`);
    } catch (error) {
        console.error(`Ошибка загрузки файла ${fileName}:`, error);
    }
}

module.exports = { uploadToS3 };
