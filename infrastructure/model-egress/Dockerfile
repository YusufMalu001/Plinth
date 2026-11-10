FROM node:22-alpine
WORKDIR /app
COPY infrastructure/model-egress/server.js ./server.js
USER node
EXPOSE 8080
CMD ["node", "server.js"]
