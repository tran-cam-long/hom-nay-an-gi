FROM node:22-alpine

WORKDIR /usr/src/app

# install deps
COPY package.json yarn.lock* ./
RUN apk add --no-cache python3 make g++ || true
RUN yarn install --frozen-lockfile || yarn install

# copy source
COPY . .

# expose port for vite dev server
EXPOSE 4000

# Run Vite in test mode and bind to 0.0.0.0 on port 4000
CMD ["yarn", "dev:test", "--", "--host", "0.0.0.0", "--port", "4000"]
