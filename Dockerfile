FROM node:20-alpine

LABEL org.opencontainers.image.source="https://github.com/VinayakGhai/terabox-complete-api"
LABEL org.opencontainers.image.description="Terabox Complete API & CLI Uploader Container Image"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENTRYPOINT ["node", "upload.js"]
CMD ["help"]
