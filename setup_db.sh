#!/bin/bash

set -a; source .env; set +a

surreal import --conn $SURREAL_ENDPOINT schema.surql
