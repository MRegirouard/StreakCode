FROM node:alpine

RUN mkdir -p /app
COPY src/ /app/src/
COPY package.json package-lock.json tsconfig.json /app/
RUN chown -R node:node /app

USER node
WORKDIR /app

RUN npm install
RUN npm run build
RUN rm -rf src package.json package-lock.json tsconfig.json

CMD ["node", "build/index.js"]
