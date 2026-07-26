# M11: custom Caddy build with a DNS-01 provider module, required for the
# wildcard `*.apps.asafarim.com` certificate (docker-compose.prod.yml's
# `caddy` service otherwise runs the stock `caddy:latest` image, which has
# no DNS provider modules built in — HTTP-01 alone cannot prove ownership of
# a wildcard host).
#
# NOT wired into docker-compose.prod.yml by default — switching the `caddy`
# service's `image: caddy:latest` to `build: { context: ./infra/caddy }` is a
# deliberate, separately reviewed operator step (see
# docs/appbuilder-m11-releases-deployment.md#dns-and-tls), taken only after
# confirming <PROVIDER_MODULE> below actually matches the DNS host that
# manages asafarim.com's records and after testing against Let's Encrypt's
# STAGING ACME endpoint first.
FROM caddy:builder AS builder

# Replace with the real module path for your DNS provider, e.g.:
#   github.com/caddy-dns/cloudflare
#   github.com/caddy-dns/route53
# There is no confirmed caddy-dns module verified against this repo's actual
# DNS host yet — confirm before building.
ARG PROVIDER_MODULE=github.com/caddy-dns/<provider>

RUN xcaddy build --with ${PROVIDER_MODULE}

FROM caddy:latest
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
