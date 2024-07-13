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

## Running

Now using pm2

```bash
pm2 start server
pm2 status server
pm2 stop server
pm2 restart server
```
### example 
jd@zeus01-dev:/APPS/_DEV/videochat-peerjs$ pm2 start server

#### legacy
./start_server.sh

## diary - jd
added pm2  
webm extension added

