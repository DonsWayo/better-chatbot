#!/usr/bin/env bash
# Build, push, and deploy asafe-ai to conek-dev (EKS). Usage: deploy/deploy-dev.sh [image-tag]
# Defaults the tag to the short sha of HEAD. Requires: aws sso login --profile development,
# docker (arm64 host — cluster nodes are arm64), helm, kubectl context for conek-cloud.
set -euo pipefail
cd "$(dirname "$0")/.."

AWS_PROFILE="${AWS_PROFILE:-development}"
REGION="eu-central-1"
ECR_HOST="588738611061.dkr.ecr.eu-central-1.amazonaws.com"
REPO="$ECR_HOST/conek/asafe-ai"
TAG="${1:-$(git rev-parse --short=7 HEAD)}"

if [[ -n "$(git status --porcelain -- src docker package.json pnpm-lock.yaml)" ]]; then
  echo "⚠️  Working tree has uncommitted app changes — image tag $TAG won't match its contents." >&2
fi

echo "→ ECR login ($AWS_PROFILE / $REGION)"
aws --profile "$AWS_PROFILE" --region "$REGION" ecr get-login-password |
  docker login --username AWS --password-stdin "$ECR_HOST"

echo "→ Build + push $REPO:$TAG"
docker build -f docker/Dockerfile -t "$REPO:$TAG" .
docker push "$REPO:$TAG"

echo "→ Helm upgrade (migrations run as pre-upgrade hook)"
helm upgrade --install asafe-ai deploy/helm/asafe-ai \
  --namespace asafe-ai \
  -f deploy/helm/asafe-ai/values-dev.yaml \
  --set image.tag="$TAG" \
  --wait --timeout 10m

echo "→ Migration job logs"
kubectl -n asafe-ai logs job/asafe-ai-migrate --tail=20 || true

echo "→ Rollout status"
kubectl -n asafe-ai get pods -l app.kubernetes.io/instance=asafe-ai
curl -fsS -o /dev/null -w 'health: %{http_code}\n' https://ai.conek.dev/api/health
echo "✅ Deployed $TAG to https://ai.conek.dev"
