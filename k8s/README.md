# Kubernetes Manifests

Kustomize-based deployment for the SocialFlow backend.

```
k8s/
├── base/                          # Shared resources (all environments)
│   ├── deployment.yaml            # Deployment — port 3001, non-root, probes
│   ├── service.yaml               # ClusterIP Service
│   ├── hpa.yaml                   # HPA (CPU 70% / Mem 80% / queue depth >50)
│   ├── ingress.yaml               # nginx Ingress (no TLS — added per overlay)
│   ├── configmap.yaml             # Non-sensitive runtime config
│   ├── secret.yaml                # ExternalSecret CRD (pulls from AWS Secrets Manager)
│   ├── cluster-secret-store.yaml  # ClusterSecretStore for ESO → AWS
│   ├── prometheus-adapter-config.yaml  # Custom metric mapping for BullMQ queue depth
│   └── kustomization.yaml
└── overlays/
    ├── dev/    # 1 replica, relaxed resources, dev hostname, letsencrypt-staging TLS
    └── prod/   # 3 replicas, larger resources, letsencrypt-prod TLS
```

## Usage

```bash
# Preview rendered manifests
kubectl kustomize k8s/overlays/dev
kubectl kustomize k8s/overlays/prod

# Apply
kubectl apply -k k8s/overlays/dev
kubectl apply -k k8s/overlays/prod
```

## Prerequisites

### cert-manager (required for TLS in all environments)

Both the dev and prod overlays use cert-manager to provision TLS certificates via
Let's Encrypt. Install cert-manager before applying any overlay:

```bash
# Install cert-manager (v1.14+)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl rollout status deployment/cert-manager -n cert-manager

# Apply ClusterIssuers (staging for dev, prod for prod)
kubectl apply -k k8s/cert-manager
```

The dev overlay uses `letsencrypt-staging` (no rate limits, untrusted cert — fine for
development). The prod overlay uses `letsencrypt-prod` (trusted cert, rate-limited).

### External Secrets Operator (required for secrets)

Secrets are **never stored in Git**. The `base/secret.yaml` is an `ExternalSecret` CRD
that instructs the External Secrets Operator (ESO) to pull values from AWS Secrets Manager
at deploy time.

**Bootstrap steps:**

1. Install ESO:
   ```bash
   helm repo add external-secrets https://charts.external-secrets.io
   helm install external-secrets external-secrets/external-secrets \
     -n external-secrets --create-namespace
   ```

2. Create the AWS Secrets Manager secret (one-time, per environment):
   ```bash
   aws secretsmanager create-secret \
     --name socialflow/app \
     --secret-string '{
       "DATABASE_URL": "postgresql://user:pass@host:5432/socialflow",
       "REDIS_HOST": "redis-host",
       "REDIS_PASSWORD": "",
       "JWT_SECRET": "<min-32-char-random-string>",
       "JWT_REFRESH_SECRET": "<min-32-char-random-string>",
       "TWITTER_API_KEY": "<key>",
       "TWITTER_API_SECRET": "<secret>"
     }'
   ```

3. Annotate the `socialflow-backend` ServiceAccount with the IAM role ARN that has
   `secretsmanager:GetSecretValue` on `socialflow/app`:
   ```bash
   kubectl annotate serviceaccount socialflow-backend \
     eks.amazonaws.com/role-arn=arn:aws:iam::<ACCOUNT_ID>:role/socialflow-secrets-role \
     -n <namespace>
   ```

4. Apply the overlay — ESO will create the `socialflow-secrets` Kubernetes Secret
   automatically and refresh it every hour.

### Prometheus Adapter (required for queue-depth HPA scaling)

The HPA scales on the `bullmq_queue_waiting` external metric. This requires the
Prometheus Adapter to be installed and configured:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring --create-namespace \
  --set prometheus.url=http://prometheus.monitoring.svc \
  --set prometheus.port=9090 \
  -f k8s/base/prometheus-adapter-config.yaml
```

## Image

The Deployment references `socialflow-backend:latest`. This image is built
exclusively from **`backend/Dockerfile`** (the canonical backend Dockerfile).
The root `./Dockerfile` is reserved for a future frontend image and must not
be used to build the backend.

Build the image manually:

```bash
docker build -f backend/Dockerfile backend/ -t socialflow-backend:latest
```

Override the image tag per environment using a Kustomize `images:` patch or
your CI pipeline:

```bash
kustomize edit set image socialflow-backend=ghcr.io/org/socialflow-backend:v1.2.3
```

## CI Checks

The `k8s-lint` CI job (`.github/workflows/ci.yml`) enforces:

- **No placeholder secrets** — fails if any rendered manifest contains `change-me`,
  `USER:PASS`, or `placeholder` values.
- **TLS required on all Ingress resources** — fails if any rendered Ingress lacks a
  `spec.tls` block.
