# Development stage
FROM node:18-alpine as development

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

# Build stage
FROM node:18-alpine as builder

WORKDIR /usr/src/app

COPY --from=development /usr/src/app ./

RUN npm run build

# Production stage
FROM node:18-alpine as production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./

RUN npm ci --only=production

CMD ["npm", "run", "start:prod"] 