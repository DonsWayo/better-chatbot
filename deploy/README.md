# Deploying asafe-ai

Two supported run paths (ADR-0006):

- **Local development → docker-compose** (kept green for every contributor).
- **Staging / production → AWS EKS** via the Helm chart in [`helm/asafe-ai`](helm/asafe-ai).

## Local (docker-compose)

```bash
cp .env.example .env     # fill POSTGRES_URL, OPENROUTER_API_KEY, BETTER_AUTH_SECRET, ...
pnpm docker-compose:up
# app on http://localhost:3000 — migrations + MCP init run on boot (migrate-on-boot default)
```

## EKS (Helm)

### Cluster prerequisites (owned by IT — ADR-0006)

- EKS cluster (EU region) with the **AWS Load Balancer Controller** (ALB ingress).
- **External Secrets Operator** + a `ClusterSecretStore` for AWS Secrets Manager.
- **ECR** repo for the image; a **cloud-native Postgres on EKS** (Postgres operator + the custom
  AI-native image: pgvector + pgvectorscale + timescaledb) — **not RDS/Aurora**;
  **ElastiCache** Redis; an **S3** bucket + IAM role for **IRSA**.
- `metrics-server` (for the HPA).

### One-time per environment

```bash
kubectl apply -f k8s/namespace.yaml
# Store the real secret values in AWS Secrets Manager under asafe-ai/<env>, then:
kubectl apply -f k8s/external-secret.example.yaml   # adjust store name / keys first
kubectl -n asafe-ai get secret asafe-ai-secrets     # confirm it synced BEFORE installing
```

### Build & push the image (CI does this)

```bash
docker build -f docker/Dockerfile -t "$ECR/asafe-ai:$TAG" .
docker push "$ECR/asafe-ai:$TAG"
```

### Install / upgrade

```bash
helm upgrade --install asafe-ai ./helm/asafe-ai \
  --namespace asafe-ai \
  --set image.repository="$ECR/asafe-ai" \
  --set image.tag="$TAG" \
  --set ingress.host=asafe-ai.internal.asafe.example \
  --set config.BETTER_AUTH_URL=https://asafe-ai.internal.asafe.example \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::<acct>:role/asafe-ai
```

The pre-upgrade hook Job runs DB migrations **once** per release; app pods run with
`DISABLE_DB_MIGRATE_ON_BOOT=true` so replicas never race on migration.

### Static manifests (environments without Helm)

```bash
helm template asafe-ai ./helm/asafe-ai -n asafe-ai -f my-values.yaml > asafe-ai.k8s.yaml
kubectl apply -f asafe-ai.k8s.yaml
```

## Env contract

See [`.env.example`](../.env.example). Sensitive keys live in the `asafe-ai-secrets` Secret:
`POSTGRES_URL`, `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`, `REDIS_URL`,
`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` (Entra SSO — ADR-0005); optional `SENTRY_DSN`,
`NEXT_PUBLIC_SENTRY_DSN`, `METRICS_AUTH_TOKEN`. Non-sensitive config is the chart's `config:` block.
