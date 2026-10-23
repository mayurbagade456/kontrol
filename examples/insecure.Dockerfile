# Sample service image - intentionally insecure for demonstration
FROM node:latest

ENV NODE_ENV=production
ENV PORT=3000

ADD . /app
RUN cd /app && npm install --production

EXPOSE 3000 5432

USER root

CMD ["node", "/app/server.js"]
