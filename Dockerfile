FROM node:14 AS mafia-backend-builder
WORKDIR /app
COPY package.json .
RUN npm install 
COPY . .
RUN npm run clean
RUN npm run build
# RUN npm prune

FROM node:14-alpine AS mafia-backend-prod
ENV TZ=Asia/Seoul
WORKDIR /app
COPY --from=mafia-backend-builder /app/dist ./dist
COPY package* .
# RUN npm ci --only=production 
RUN npm install --production
EXPOSE 3065
CMD npm run start:prod