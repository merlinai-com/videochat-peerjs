# Video chat website using peerjs for WebRTC

## Install

```bash
pnpm install
```

Set up the `.env` file:

```
PORT=10100
HOST=localhost
```

- `PORT` is the port to listen on
- `HOST` is the IP address to listen on, or `localhost`
- `UPLOAD_DIRECTORY` the directory uploads are stored in (default: `./uploads`)
- `TRUST_PROXY` set this to `true` if running behind a reverse proxy
  - **Important**: the last reverse proxy must set `X-Forwarded-For`, `X-Forwarded-Host` and `X-Forwarded-Proto`

## Running

```bash
./start_server.sh
```
