# Stage 0: build the static site.
FROM node:24-alpine AS build-stage
WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 1: serve the compiled output, and nothing else, from nginx.
#
# nginx has no official brotli module -- nginx.org packages geoip, image-filter,
# njs, perl, xslt, otel and acme, but not brotli -- so a third-party build is
# the only way to get brotli_static. This one tracks nginx stable closely and is
# actively maintained. Pinned, because the tag moved under us otherwise.
FROM fholzer/nginx-brotli:v1.30.4

COPY --from=build-stage /usr/src/app/dist/ /usr/share/nginx/html
COPY --from=build-stage /usr/src/app/nginx.conf /etc/nginx/conf.d/default.conf
