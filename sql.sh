#!/bin/bash

set -a; source .env; set +a

surreal sql --conn $SURREAL_ENDPOINT
