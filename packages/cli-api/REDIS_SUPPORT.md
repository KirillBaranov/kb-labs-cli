# Redis Support for Multi-Instance Deployments

## Overview

The `@kb-labs/cli-api` package supports **optional** Redis integration for multi-instance deployments. Redis is NOT required for single-instance scenarios (development, small production).

## When Do You Need Redis?

### ✅ You DON'T need Redis if:

- Running a single REST API instance (dev, small prod)
- Deploying to a single VM or container
- Using serverless with single-region deployment
- Testing locally

### ⚠️ You NEED Redis if:

- Running multiple REST API instances behind a load balancer
- Using Kubernetes Horizontal Pod Autoscaler (HPA)
- Deploying across multiple availability zones
- Need consistent cache across instances

## How It Works

### Without Redis (Default)

```
┌─────────────────────────────┐
│    REST API Instance        │
│                             │
│  In-memory cache            │
│  Local onChange events      │
│  File watch mode enabled    │
└─────────────────────────────┘
```

**Pros:**
- Zero dependencies
- Fast (no network calls)
- Simple setup

**Cons:**
- Doesn't scale horizontally
- Cache not shared

### With Redis (Multi-Instance)

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ REST API #1 │  │ REST API #2 │  │ REST API #3 │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       └────────────────┼────────────────┘
                        │
                 ┌──────▼──────┐
                 │    Redis    │
                 │             │
                 │  Cache      │
                 │  PubSub     │
                 └─────────────┘
```

**Pros:**
- Shared cache (consistent data)
- Event propagation across instances
- Horizontal scaling ready

**Cons:**
- Requires Redis infrastructure
- Slightly higher latency (~2ms)

## Configuration

### Single Instance (No Redis)

```bash
# Just start the server
npm start

# Output:
# [Bootstrap] Using in-memory cache (single instance mode)
# [Bootstrap] File watch mode: enabled
```

### Multi-Instance (With Redis)

```bash
# Set REDIS_URL environment variable
export REDIS_URL="redis://localhost:6379"
npm start

# Output:
# [Bootstrap] Using Redis for distributed cache and events
# [Bootstrap] File watch mode: disabled
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | none | Redis connection string (e.g., `redis://host:6379`) |

## Deployment Examples

### Docker Compose (Local Development)

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s

  rest-api-1:
    build: .
    ports:
      - "3001:3000"
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy

  rest-api-2:
    build: .
    ports:
      - "3002:3000"
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy

  rest-api-3:
    build: .
    ports:
      - "3003:3000"
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      redis:
        condition: service_healthy
```

**Test it:**

```bash
# Start all services
docker-compose up -d

# Hit different instances
curl http://localhost:3001/health/plugins  # Instance 1
curl http://localhost:3002/health/plugins  # Instance 2
curl http://localhost:3003/health/plugins  # Instance 3

# All should return same plugin count and registry version
```

### Kubernetes (Production)

```yaml
# redis-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "200m"

---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

```yaml
# rest-api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rest-api
spec:
  replicas: 3  # Multiple instances
  selector:
    matchLabels:
      app: rest-api
  template:
    metadata:
      labels:
        app: rest-api
    spec:
      containers:
      - name: rest-api
        image: kb-labs-rest-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /live
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 10

---
apiVersion: v1
kind: Service
metadata:
  name: rest-api-service
spec:
  selector:
    app: rest-api
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 3000
```

**Deploy:**

```bash
# Deploy Redis
kubectl apply -f redis-deployment.yaml

# Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis --timeout=60s

# Deploy REST API
kubectl apply -f rest-api-deployment.yaml

# Check all pods are running
kubectl get pods

# Test load balancing
for i in {1..20}; do
  curl -s http://<LOAD_BALANCER_IP>/health/plugins | jq '.pluginsCount'
done
```

### Kubernetes with HPA (Auto-Scaling)

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: rest-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: rest-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

```bash
kubectl apply -f hpa.yaml

# Watch autoscaling in action
kubectl get hpa rest-api-hpa --watch

# Load test
hey -z 60s -c 50 http://<LOAD_BALANCER_IP>/openapi.json

# Pods should auto-scale based on load
```

## How Redis is Used

### 1. Distributed Cache

**What's cached:**
- Plugin manifests
- Discovery results
- OpenAPI specs

**TTL:** 30 seconds (configurable)

**Key format:**
- `cli-api:plugins:list`
- `cli-api:manifest:{pluginId}`
- `cli-api:openapi:{pluginId}`

**Example:**

```bash
# Connect to Redis
redis-cli

# Check cached plugins
GET cli-api:plugins:list

# Check manifest for specific plugin
GET cli-api:manifest:@kb-labs/mind

# Check TTL
TTL cli-api:plugins:list
# (integer) 27
```

### 2. Event Bus (PubSub)

**Events published:**
- `registry:changed` - When plugins are added/removed/updated

**Payload:**

```json
{
  "added": [{"id": "@kb-labs/new-plugin", "version": "1.0.0"}],
  "removed": [],
  "changed": [
    {
      "from": {"id": "@kb-labs/mind", "version": "1.0.0"},
      "to": {"id": "@kb-labs/mind", "version": "1.1.0"}
    }
  ]
}
```

**Subscribe to events:**

```bash
# Connect to Redis
redis-cli

# Subscribe to registry changes
PSUBSCRIBE registry:*

# In another terminal, trigger refresh
curl -X POST http://localhost:3000/admin/refresh

# You'll see:
# 1) "pmessage"
# 2) "registry:*"
# 3) "registry:changed"
# 4) "{\"added\":[...],\"removed\":[...],\"changed\":[...]}"
```

## Behavior Differences

| Feature | Without Redis | With Redis |
|---------|---------------|------------|
| Cache | In-memory Map | Redis store |
| Cache scope | Per instance | Shared across instances |
| onChange events | Local process | Broadcast via PubSub |
| File watch mode | Enabled | Disabled |
| Discovery on startup | Always runs | Checks cache first |
| Memory per instance | ~50MB | ~40MB |
| /openapi.json latency | ~15ms | ~2ms (cache hit), ~20ms (miss) |
| Horizontal scaling | ❌ No | ✅ Yes |

## Troubleshooting

### Redis Connection Failed

**Symptom:**

```
[Bootstrap] Using Redis for distributed cache and events
[Bootstrap] Redis connection failed, falling back to in-memory: Error: connect ECONNREFUSED
[Bootstrap] Using in-memory cache (single instance mode)
```

**Cause:** Redis is not running or `REDIS_URL` is incorrect.

**Fix:**

```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Verify REDIS_URL
echo $REDIS_URL
# Should be: redis://host:6379

# Test connection
nc -zv localhost 6379
# Should return: Connection to localhost 6379 port [tcp/*] succeeded!
```

### Stale Cache Across Instances

**Symptom:** Different instances return different plugin lists.

**Cause:** Redis PubSub not working or instances not subscribed.

**Debug:**

```bash
# Connect to Redis
redis-cli

# Check active subscriptions
PUBSUB CHANNELS
# Should show: registry:changed

# Check clients
CLIENT LIST
# Should show multiple connections (publisher + subscriber per instance)

# Force refresh on all instances
curl -X POST http://instance1/admin/refresh
# All instances should receive event via PubSub
```

### High Redis Memory Usage

**Symptom:** Redis memory grows over time.

**Cause:** Keys not expiring properly or no TTL set.

**Debug:**

```bash
# Connect to Redis
redis-cli

# Check memory usage
INFO memory
# Used memory: ...

# Check keys with no expiration
KEYS cli-api:*

# Check TTL on each key
TTL cli-api:plugins:list
# Should be: (integer) 30 (or less)

# If -1, key has no expiration
# Manually set TTL
EXPIRE cli-api:plugins:list 30
```

**Fix:** Ensure `ttlMs` is set in `createCliAPI` options:

```typescript
const cliApi = await createCliAPI({
  cache: {
    adapter: redisCache,
    ttlMs: 30_000, // 30 seconds
  },
});
```

### Redis Latency Issues

**Symptom:** Slow responses on `/openapi.json` and other endpoints.

**Debug:**

```bash
# Check Redis latency
redis-cli --latency
# avg: 0.50 ms, min: 0.20 ms, max: 5.00 ms

# Check slow queries
redis-cli SLOWLOG GET 10

# Monitor commands in real-time
redis-cli MONITOR
```

**Fix:**

- Use Redis on same network (avoid cross-region)
- Enable Redis persistence for faster restarts
- Consider Redis Cluster for high availability

## Performance Tuning

### Redis Configuration

```conf
# redis.conf

# Memory
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence (optional, for faster restarts)
save 900 1
save 300 10
save 60 10000

# Network
tcp-backlog 511
timeout 0
tcp-keepalive 300

# Performance
appendonly no  # We don't need durability for cache
```

### CliAPI Configuration

```typescript
const cliApi = await createCliAPI({
  cache: {
    adapter: redisCache,
    ttlMs: 30_000, // Lower = fresher data, higher = less Redis load
  },
  discovery: {
    watch: false, // Always false with Redis
  },
});
```

### Monitoring

```bash
# Watch Redis stats
watch -n 1 'redis-cli INFO stats | grep -E "total_commands_processed|keyspace_hits|keyspace_misses"'

# Calculate cache hit rate
redis-cli INFO stats | grep -E "keyspace_hits|keyspace_misses"
# Hit rate = hits / (hits + misses) * 100%
```

## Migration Checklist

### From Single Instance to Multi-Instance

- [ ] Deploy Redis (standalone or cluster)
- [ ] Test Redis connectivity from REST API pods
- [ ] Set `REDIS_URL` environment variable
- [ ] Deploy REST API with Redis config
- [ ] Verify cache is shared (check same registry version across instances)
- [ ] Test event propagation (add plugin, check all instances update)
- [ ] Monitor Redis metrics (memory, connections, latency)
- [ ] Set up Redis alerts (high memory, connection drops)
- [ ] Configure autoscaling (HPA)
- [ ] Load test and validate performance

## FAQ

**Q: Is Redis required for production?**  
A: No, only if you run multiple instances behind a load balancer.

**Q: What happens if Redis goes down?**  
A: The system falls back to in-memory cache automatically. You'll see a warning in logs.

**Q: Can I use Redis Cluster?**  
A: Yes, just set `REDIS_URL` to any node in the cluster.

**Q: Does Redis add latency?**  
A: Minimal (~2ms per cache operation). Benefits outweigh costs in multi-instance scenarios.

**Q: How much memory does Redis use?**  
A: ~10-50MB depending on number of plugins and cache size.

**Q: Can I disable Redis after enabling it?**  
A: Yes, just unset `REDIS_URL`. System reverts to in-memory mode.

**Q: Do I need Redis Sentinel for HA?**  
A: Recommended for production, but not required initially.

## Next Steps

- [ADR-0011: Redis Multi-Instance Support](../docs/adr/0011-redis-multi-instance-support.md)
- [Kubernetes Deployment Guide](./KUBERNETES_DEPLOYMENT.md)
- [Performance Tuning Guide](./PERFORMANCE_TUNING.md)

