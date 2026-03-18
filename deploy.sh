#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/www/wwwroot/domesticGEO}"
BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-domestic-geo}"
DATA_DIR="${DATA_DIR:-/www/wwwroot/domesticGEO-data}"
DATA_FILE="${DATA_FILE:-${DATA_DIR}/site-data.json}"

echo "[deploy] APP_DIR=${APP_DIR}"
echo "[deploy] BRANCH=${BRANCH}"
echo "[deploy] APP_NAME=${APP_NAME}"
echo "[deploy] DATA_FILE=${DATA_FILE}"

if [ ! -d "${APP_DIR}/.git" ]; then
  echo "[deploy] ERROR: ${APP_DIR} is not a git repository."
  exit 1
fi

mkdir -p "${DATA_DIR}"

cd "${APP_DIR}"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "${CURRENT_BRANCH}" != "${BRANCH}" ]; then
  git checkout "${BRANCH}"
fi

git fetch origin "${BRANCH}"
git pull --ff-only origin "${BRANCH}"

if [ ! -f "${DATA_FILE}" ]; then
  if [ -f "${APP_DIR}/data/site-data.json" ]; then
    cp "${APP_DIR}/data/site-data.json" "${DATA_FILE}"
  else
    printf '{\n  "brand": {},\n  "posts": [],\n  "submissions": []\n}\n' > "${DATA_FILE}"
  fi
fi

if [ -f "${APP_DIR}/package-lock.json" ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

if [ -f "${APP_DIR}/.env.production" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env.production"
  set +a
fi

export NODE_ENV="${NODE_ENV:-production}"
export DATA_FILE="${DATA_FILE}"

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --only "${APP_NAME}" --update-env
else
  pm2 start ecosystem.config.cjs --only "${APP_NAME}" --update-env
fi

pm2 save
pm2 status "${APP_NAME}"
echo "[deploy] done."
