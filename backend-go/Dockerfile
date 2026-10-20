FROM golang:1.27.1-alpine AS build
WORKDIR /src
COPY backend-go/go.mod backend-go/go.sum ./
RUN go mod download
COPY backend-go/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/api ./cmd/migrate ./cmd/admin

FROM alpine:3.23
RUN apk add --no-cache ca-certificates && addgroup -S club && adduser -S -G club club
COPY --from=build /out/ /usr/local/bin/
COPY deployment/api-entrypoint.sh /usr/local/bin/api-entrypoint
USER club
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD wget -q -O /dev/null http://127.0.0.1:3000/ready || exit 1
ENTRYPOINT ["sh","/usr/local/bin/api-entrypoint"]
CMD ["api"]
