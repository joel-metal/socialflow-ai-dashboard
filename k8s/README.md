# Kubernetes Manifests

Kustomize-based deployment for the SocialFlow backend.

```
k8s/
├── base/                  # Shared resources (all environments)
│   ├── deployment.yaml    # Deployment — port 3001, non-root, probes
│   ├── service.yaml       # ClusterIP Service
│   ├── hpa.yaml           # HorizontalPodAutoscaler (CPU 70% / Mem 80%)
│   ├── ingress.yaml       # nginx Ingress
│   ├── configmap.yaml     # Non-sensitive runtime config
│   ├── secret.yaml        # Secret template (replace values before applying)
│   └── kustomization.yaml
└── overlays/
    ├── dev/               # 1 replica, relaxed resources, dev hostname
    └── prod/              # 3 replicas, larger resources, TLS via cert-manager
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

## Secrets

`base/secret.yaml` is a **template only** — never commit real credentials.
In production, manage secrets via:
- [External Secrets Operator](https://external-secrets.io/) + AWS Secrets Manager, or
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets), or
- HashiCorp Vault Agent Injector

## Image

The Deployment references `socialflow-backend:latest`. Override the image tag
per environment using a Kustomize `images:` patch or your CI pipeline:

```bash
kustomize edit set image socialflow-backend=ghcr.io/org/socialflow-backend:v1.2.3
```
