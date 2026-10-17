# Runtime only: Node + ffmpeg. All code and data come in as bind mounts (see docker-compose.yml).
FROM node:24.12.0-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV HOST=0.0.0.0 PROJECTS_DIR=/data/projects PROXY_DIR=/data/proxies
EXPOSE 4747
CMD ["node", "--watch-path=server.mjs", "--watch-path=lib", "server.mjs", "4747"]
