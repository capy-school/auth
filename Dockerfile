# syntax=docker/dockerfile:1
ARG ALPINE_IMAGE=alpine:3.24@sha256:c26612752c78b18faacd63c7d50f4592c2e7b0f25e0e20e82bd74e465c57ab0d
ARG BUN_IMAGE=oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0

FROM ${BUN_IMAGE} AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
# The shared lock also contains the legacy DB/CLI. Its native install scripts
# are unnecessary for a static build; frontend binaries arrive in locked
# platform packages. Do not compile or initialize a backend during this build.
RUN bun install --frozen-lockfile --ignore-scripts \
    && bun --bun node_modules/vite/bin/vite.js --version \
    && bun node_modules/esbuild/bin/esbuild --version

FROM dependencies AS frontend
COPY svelte.config.js vite.sveltekit.config.ts tsconfig.json tsconfig.sveltekit.json ./
COPY src/kit/ ./src/kit/
COPY src/styles/ ./src/styles/
COPY src/components/account/ ./src/components/account/
COPY src/lib/auth-client.ts src/lib/local-policy.mjs src/lib/apps.ts src/lib/local-client.ts src/lib/local-inbox.mjs src/lib/dashboard-notes.ts ./src/lib/
COPY scripts/kit-proxy.mjs ./scripts/kit-proxy.mjs
COPY public/ ./public/
RUN bun --bun run kit:build

FROM ${ALPINE_IMAGE} AS assets-tools
RUN apk add --no-cache python3 brotli zstd
WORKDIR /work
COPY docker/assets.py docker/nginx.py ./docker/

FROM assets-tools AS assets
COPY --from=frontend /app/.svelte-kit/static/ /input/
RUN python3 -m docker.assets /input /out/srv \
    && python3 -m docker.nginx /out/srv /out/nginx.conf.template

FROM ${ALPINE_IMAGE} AS nginx-build
RUN apk add --no-cache build-base curl pcre2-dev pcre2-static linux-headers openssl openssl-dev openssl-libs-static ca-certificates binutils
ARG NGINX_VERSION=1.30.6
ARG NGINX_SHA256=3cf46f5ed7504d460125866b7bea99fb357f31d887e2e63b35503310e9b8b6c8
WORKDIR /build
RUN curl -fL "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" -o source.tar.gz \
    && echo "${NGINX_SHA256}  source.tar.gz" | sha256sum -c - \
    && tar -xzf source.tar.gz
WORKDIR /build/nginx-${NGINX_VERSION}
RUN ./configure \
    --prefix=/tmp/nginx \
    --sbin-path=/nginx \
    --conf-path=/tmp/nginx.conf \
    --pid-path=/tmp/nginx.pid \
    --error-log-path=stderr \
    --http-log-path=/dev/stdout \
    --http-client-body-temp-path=/tmp/client_temp \
    --http-proxy-temp-path=/tmp/proxy_temp \
    --with-cc-opt='-Os -ffunction-sections -fdata-sections' \
    --with-ld-opt='-static -Wl,--gc-sections' \
    --with-http_ssl_module \
    --without-http_gzip_module \
    --without-http_ssi_module \
    --without-http_autoindex_module \
    --without-http_geo_module \
    --without-http_uwsgi_module \
    --without-http_scgi_module \
    --without-http_fastcgi_module \
    --without-http_memcached_module \
    && make -j2 \
    && strip objs/nginx \
    && ! readelf -l objs/nginx | grep -q INTERP \
    && ! readelf -d objs/nginx | grep -q NEEDED
RUN mkdir -p /rootfs/tmp /rootfs/licenses /rootfs/etc/nginx /rootfs/etc/ssl/certs \
    && chmod 1777 /rootfs/tmp \
    && cp objs/nginx /rootfs/nginx \
    && cp conf/mime.types /rootfs/etc/nginx/mime.types \
    && cp /etc/ssl/certs/ca-certificates.crt /rootfs/etc/ssl/certs/ca-certificates.crt \
    && cp LICENSE /rootfs/licenses/nginx-LICENSE \
    && curl -fL "https://raw.githubusercontent.com/PCRE2Project/pcre2/pcre2-$(pcre2-config --version)/LICENCE.md" -o /rootfs/licenses/pcre2-LICENCE.md \
    && curl -fL "https://raw.githubusercontent.com/openssl/openssl/openssl-$(openssl version | awk '{print $2}')/LICENSE.txt" -o /rootfs/licenses/openssl-LICENSE.txt \
    && curl -fL 'https://git.musl-libc.org/cgit/musl/plain/COPYRIGHT?h=v1.2.6' -o /rootfs/licenses/musl-COPYRIGHT \
    && curl -fL 'https://www.mozilla.org/MPL/2.0/index.txt' -o /rootfs/licenses/ca-certificates-MPL-2.0 \
    && apk info -v > /rootfs/licenses/nginx-build-packages.txt

FROM ${ALPINE_IMAGE} AS launcher-build
RUN apk add --no-cache rust cargo curl binutils
WORKDIR /build/launcher
COPY docker/launcher/Cargo.toml docker/launcher/Cargo.lock ./
COPY docker/launcher/src/ ./src/
RUN cargo test --locked --offline \
    && RUSTFLAGS='-C target-feature=+crt-static' cargo build --release --locked --offline \
    && ! readelf -l target/release/auth-static-launcher | grep -q INTERP \
    && ! readelf -d target/release/auth-static-launcher | grep -q NEEDED
RUN mkdir -p /out/licenses \
    && cp target/release/auth-static-launcher /out/launcher \
    && version="$(rustc --version | awk '{print $2}')" \
    && curl -fL "https://raw.githubusercontent.com/rust-lang/rust/${version}/LICENSE-MIT" -o /out/licenses/rust-LICENSE-MIT \
    && curl -fL "https://raw.githubusercontent.com/rust-lang/rust/${version}/LICENSE-APACHE" -o /out/licenses/rust-LICENSE-APACHE \
    && curl -fL "https://raw.githubusercontent.com/rust-lang/rust/${version}/COPYRIGHT" -o /out/licenses/rust-COPYRIGHT \
    && apk info -v > /out/licenses/launcher-build-packages.txt

# Only the exclusive test target contains Python or the fake API.
FROM ${ALPINE_IMAGE} AS test-api
RUN apk add --no-cache python3 openssl
COPY tests/fixtures/static-api.py /fixture/static-api.py
USER 101:101
ENTRYPOINT ["python3", "-u", "/fixture/static-api.py"]

# Independently buildable, frontend-free runtime for isolated fixture tests.
FROM scratch AS runtime
COPY --from=nginx-build /rootfs/ /
COPY --from=launcher-build /out/ /
USER 101:101
EXPOSE 8080
ENTRYPOINT ["/launcher"]

FROM runtime AS tiny
COPY --from=assets /out/srv/ /srv/
COPY --from=assets /out/nginx.conf.template /etc/nginx/nginx.conf.template
