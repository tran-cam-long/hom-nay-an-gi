FROM node:18-alpine

WORKDIR /app

# copy root package.json and install runtime deps
COPY package.json yarn.lock* ./
RUN apk add --no-cache python3 make g++ || true
RUN yarn install --frozen-lockfile || yarn install

# copy app sources
COPY src ./src

CMD ["node", "src/index.js"]
