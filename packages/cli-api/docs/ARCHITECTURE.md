# Package Architecture Description: @kb-labs/cli-api

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/cli-api** provides programmatic API for KB Labs CLI. It offers stable JSON-compatible contracts for REST API, webhooks, agents, and external integrations. The package includes plugin discovery, snapshot management, Redis pub/sub, OpenAPI generation, and workflow support.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide stable programmatic API for CLI operations.

**Scope Boundaries**:
- **In Scope**: Plugin discovery, snapshot management, Redis pub/sub, OpenAPI, workflows
- **Out of Scope**: CLI command implementations, REST server implementation

**Domain**: CLI Infrastructure / API Layer

### 1.2 Key Responsibilities

1. **Plugin Discovery**: Discover plugins using multiple strategies
2. **Snapshot Management**: Producer/consumer snapshot pattern
3. **Redis Pub/Sub**: Live updates with exponential backoff
4. **OpenAPI Generation**: Automatic spec generation
5. **Workflow Support**: Workflow execution and management
6. **Health Monitoring**: System health checks

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
CLI API
    │
    ├──► Plugin Discovery (workspace, pkg, dir, file)
    ├──► Snapshot Management (producer/consumer)
    ├──► Redis Pub/Sub (live updates)
    ├──► OpenAPI Generation (spec generation)
    ├──► Studio Registry (metadata aggregation)
    ├──► Caching (in-memory + disk)
    └──► Workflow Support (execution, management)
```

### 2.2 Architectural Style

- **Style**: API Layer Pattern with Producer/Consumer
- **Rationale**: Stable interface for external integrations

## 3. Component Architecture

### 3.1 Component: CLI API Implementation

- **Purpose**: Main API implementation
- **Responsibilities**: Plugin discovery, snapshot management, health checks
- **Dependencies**: cli-core, plugin-manifest, workflow packages

### 3.2 Component: Workflow Service

- **Purpose**: Workflow execution and management
- **Responsibilities**: Run workflows, list runs, manage workflow state
- **Dependencies**: workflow-engine, workflow-contracts

### 3.3 Component: Snapshot Management

- **Purpose**: Manage registry snapshots
- **Responsibilities**: Producer/consumer pattern, disk persistence
- **Dependencies**: None

## 4. Data Flow

```
createCliAPI(options)
    │
    ├──► Initialize discovery
    ├──► Setup snapshot (producer/consumer)
    ├──► Connect Redis (if configured)
    ├──► Setup caching
    └──► return CliAPI instance

CliAPI.discoverPlugins()
    │
    ├──► Run discovery strategies
    ├──► Build registry snapshot
    ├──► Cache snapshot
    └──► return snapshot
```

## 5. Design Patterns

- **Factory Pattern**: API creation via factory
- **Producer/Consumer Pattern**: Snapshot management
- **Adapter Pattern**: Redis pub/sub adapter
- **Cache Pattern**: Layered caching (memory + disk)

## 6. Performance Architecture

- **Time Complexity**: O(n) for discovery, O(1) for cached operations
- **Space Complexity**: O(n) where n = number of plugins
- **Bottlenecks**: Plugin discovery for large workspaces

## 7. Security Architecture

- **Input Validation**: All inputs validated
- **Path Validation**: Path operations validated
- **Redis Security**: Secure Redis connections
- **Plugin Security**: Plugin loading with validation

---

**Last Updated**: 2025-11-16

