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

## Location
`zeus01-dev:/APPS/_DEV/videochat-peerjs`

## Running
Now using pm2, but still use:

```
./start_server.sh
```

Check contents of `start_server.sh` before using it.  

These will also work, as long as `pm2` is installed and `PATH` is correct:

```bash
pm2 start server
pm2 status server
pm2 stop server
pm2 restart server
```
### example 
jd@zeus01-dev:/APPS/_DEV/videochat-peerjs$ ./start_server.sh


## diary - jd
added pm2  
webm extension added

## BRANCH HISTORY
create `stream-video-only` from `streaming-upload`
