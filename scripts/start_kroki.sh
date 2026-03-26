#!/bin/bash
set -a; source <(tr -d '\r' < "$(dirname "$0")/../.env"); set +a
docker run -p "${KROKI_PORT}:${KROKI_PORT}" \
  -e PLANTUML_LIMIT_SIZE="${PLANTUML_LIMIT_SIZE:-16384}" \
  --name "${KROKI_CONTAINER}" -d "${KROKI_IMAGE}"
