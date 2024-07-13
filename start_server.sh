#!/bin/bash
## start_server.sh

## OLD VERSION
# set -a; source .env; set +a
# node server.js


## Load nvm
# export NVM_DIR="$([ -z "${XDG_CONFIG_HOME-}" ] && printf %s "${HOME}/.nvm" || printf %s "${XDG_CONFIG_HOME}/nvm")"
# [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

## Install and use Node.js 20.2.0
# nvm install 20.2.0
# nvm use 20.2.0

# Load environment variables from .env file
set -a
source .env
set +a

## Install PM2 if not installed
# if ! command -v pm2 &> /dev/null
# then
#     npm install -g pm2
# fi

# Start the server with PM2
pm2 start server.js --watch
