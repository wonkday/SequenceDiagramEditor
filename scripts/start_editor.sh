#!/bin/bash
set -a; source <(tr -d '\r' < "$(dirname "$0")/../.env"); set +a
docker-compose up -d --build
