# Graph Store Service

<cite>
**Referenced Files in This Document**
- [graph_store.py](file://backend/app/services/graph_store.py)
- [graph_db.py](file://backend/app/models/graph_db.py)
- [graph.py](file://backend/app/api/graph.py)
- [config.py](file://backend/app/config.py)
- [graph_builder.py](file://backend/app/services/graph_builder.py)
- [entity_extractor.py](file://backend/app/services/entity_extractor.py)
- [extraction_worker.py](file://backend/app/services/extraction_worker.py)
- [logger.py](file://backend/app/utils/logger.py)
- [run.py](file://backend/run.py)
- [__init__.py](file://backend/app/__init__.py)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction

The Graph Store service is a comprehensive graph data management system that provides unified access to graph data through local PostgreSQL operations, serving as a complete replacement for Zep Cloud API calls. This service enables the creation, management, and querying of knowledge graphs with full support for nodes, edges, episodes, and ontologies.

The service operates as a centralized data access layer that handles all graph lifecycle operations, including creation, modification, and deletion of graph components. It provides robust episode management for processing textual content through LLM-powered entity extraction, comprehensive node and edge CRUD operations, and advanced search capabilities using PostgreSQL's full-text search features.

## Project Structure

The Graph Store service is organized within a modular architecture that separates concerns across distinct layers:

```mermaid
graph TB
subgraph "API Layer"
API[Graph API Routes]
Builder[Graph Builder Service]
end
subgraph "Service Layer"
Store[Graph Store]
Extractor[Entity Extractor]
Worker[Extraction Worker]
end
subgraph "Data Layer"
Models[ORM Models]
DB[(PostgreSQL Database)]
end
subgraph "Support Layer"
Config[Configuration]
Logger[Logging]
end
API --> Builder
Builder --> Store
Builder --> Extractor
Builder --> Worker
Store --> Models
Extractor --> Store
Worker --> Store
Models --> DB
Store --> DB
API --> Config
Builder --> Config
Store --> Logger
Extractor --> Logger
Worker --> Logger
```

**Diagram sources**
- [graph.py:1-604](file://backend/app/api/graph.py#L1-L604)
- [graph_store.py:1-375](file://backend/app/services/graph_store.py#L1-L375)
- [graph_builder.py:1-307](file://backend/app/services/graph_builder.py#L1-L307)
- [entity_extractor.py:1-291](file://backend/app/services/entity_extractor.py#L1-L291)
- [extraction_worker.py:1-109](file://backend/app/services/extraction_worker.py#L1-L109)

**Section sources**
- [graph_store.py:1-375](file://backend/app/services/graph_store.py#L1-L375)
- [graph_db.py:1-151](file://backend/app/models/graph_db.py#L1-L151)
- [graph.py:1-604](file://backend/app/api/graph.py#L1-L604)

## Core Components

The Graph Store service consists of several interconnected components that work together to provide comprehensive graph data management:

### GraphStore Class
The central component responsible for all graph data operations, providing a unified interface for:
- Graph lifecycle management (create, delete, update)
- Episode processing and management
- Node and edge CRUD operations
- Search functionality
- Graph statistics collection

### ORM Models
The data layer consists of four primary models:
- **Graph**: Metadata and configuration for graph instances
- **Node**: Entity representations with labels and attributes
- **Edge**: Relationship connections between nodes
- **Episode**: Text chunks for processing through LLM

### Supporting Services
- **GraphBuilderService**: High-level orchestration for graph construction workflows
- **EntityExtractor**: LLM-powered entity and relationship extraction
- **ExtractionWorker**: Background processing of episodes
- **Configuration Management**: Centralized configuration loading and validation

**Section sources**
- [graph_store.py:21-375](file://backend/app/services/graph_store.py#L21-L375)
- [graph_db.py:24-105](file://backend/app/models/graph_db.py#L24-L105)

## Architecture Overview

The Graph Store service follows a layered architecture pattern with clear separation of concerns:

```mermaid
sequenceDiagram
participant Client as "Client Application"
participant API as "Graph API"
participant Builder as "Graph Builder"
participant Store as "Graph Store"
participant DB as "PostgreSQL Database"
Client->>API : POST /api/graph/build
API->>Builder : create_graph()
Builder->>Store : create_graph()
Store->>DB : INSERT graphs
DB-->>Store : SUCCESS
Store-->>Builder : graph_id
Builder-->>API : graph_id
Client->>API : POST /api/graph/build (with chunks)
API->>Builder : add_text_batches()
Builder->>Store : add_episode_batch()
Store->>DB : INSERT episodes
DB-->>Store : SUCCESS
Store-->>Builder : episode_uuids
Builder-->>API : episode_uuids
Note over Client,DB : Background processing via ExtractionWorker
Client->>API : GET /api/graph/data/{graph_id}
API->>Builder : get_graph_data()
Builder->>Store : get_all_nodes() + get_all_edges()
Store->>DB : SELECT nodes + edges
DB-->>Store : Results
Store-->>Builder : Graph data
Builder-->>API : Complete graph data
API-->>Client : Graph data response
```

**Diagram sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [graph_builder.py:185-307](file://backend/app/services/graph_builder.py#L185-L307)
- [graph_store.py:32-375](file://backend/app/services/graph_store.py#L32-L375)

The architecture ensures scalability through:
- Session-based database transactions for data consistency
- Asynchronous processing for long-running operations
- Modular design enabling easy maintenance and extension
- Comprehensive error handling and logging

## Detailed Component Analysis

### Graph Lifecycle Operations

The GraphStore provides comprehensive graph lifecycle management through the following operations:

#### Graph Creation and Deletion
```mermaid
flowchart TD
CreateGraph["create_graph()"] --> ValidateParams["Validate parameters"]
ValidateParams --> StartSession["Start database session"]
StartSession --> CreateGraphRecord["INSERT graph record"]
CreateGraphRecord --> CommitTransaction["Commit transaction"]
CommitTransaction --> LogSuccess["Log creation success"]
DeleteGraph["delete_graph()"] --> FindGraph["Find graph by ID"]
FindGraph --> GraphExists{"Graph exists?"}
GraphExists --> |Yes| DeleteGraphRecord["DELETE graph record"]
GraphExists --> |No| LogWarning["Log warning: not found"]
DeleteGraphRecord --> CommitTransaction2["Commit transaction"]
CommitTransaction2 --> LogSuccess2["Log deletion success"]
```

**Diagram sources**
- [graph_store.py:32-55](file://backend/app/services/graph_store.py#L32-L55)

The service ensures referential integrity through CASCADE deletion policies defined in the ORM models, automatically removing associated nodes, edges, and episodes when a graph is deleted.

#### Ontology Management
The GraphStore maintains graph ontologies as JSONB data, enabling dynamic schema definition and validation:

**Section sources**
- [graph_store.py:56-71](file://backend/app/services/graph_store.py#L56-L71)
- [graph_db.py:24-36](file://backend/app/models/graph_db.py#L24-L36)

### Episode Management System

The episode management system handles text processing workflows through LLM-powered extraction:

```mermaid
stateDiagram-v2
[*] --> Pending : Episode created
Pending --> Processing : LLM extraction started
Processing --> Processed : Extraction successful
Processing --> Failed : Extraction error
Processed --> [*]
Failed --> [*]
note right of Pending
Episode stored with content
and processing metadata
end note
note right of Processing
LLM extracts entities
and relationships
from episode text
end note
note right of Processed
Nodes and edges created
in graph database
end note
note right of Failed
Error recorded in
episode metadata
end note
```

**Diagram sources**
- [graph_store.py:75-124](file://backend/app/services/graph_store.py#L75-L124)
- [entity_extractor.py:26-166](file://backend/app/services/entity_extractor.py#L26-L166)

The system processes episodes asynchronously through the ExtractionWorker, which monitors for pending episodes and processes them sequentially with progress tracking.

**Section sources**
- [graph_store.py:75-124](file://backend/app/services/graph_store.py#L75-L124)
- [extraction_worker.py:30-108](file://backend/app/services/extraction_worker.py#L30-L108)

### Node CRUD Operations

The GraphStore provides comprehensive node management capabilities:

#### Node Creation and Retrieval
```mermaid
classDiagram
class Node {
+UUID uuid
+String graph_id
+Text name
+String[] labels
+Text summary
+JSONB attributes
+DateTime created_at
}
class GraphStore {
+add_node(graph_id, name, labels, summary, attributes) String
+get_node(uuid) Dict
+find_node_by_name(graph_id, name, label) Dict
+update_node(uuid, summary, attributes) void
+get_all_nodes(graph_id, limit, offset) Dict[]
+get_node_edges(uuid) Dict[]
}
GraphStore --> Node : "manages"
```

**Diagram sources**
- [graph_store.py:128-221](file://backend/app/services/graph_store.py#L128-L221)
- [graph_db.py:39-58](file://backend/app/models/graph_db.py#L39-L58)

The node management system includes intelligent deduplication through the `find_node_by_name` method, which considers both name and label combinations to prevent duplicate entity creation.

#### Node Attribute Management
Nodes support flexible attribute storage through JSONB columns, enabling:
- Dynamic schema evolution without database migrations
- Rich metadata storage for complex entity representations
- Efficient querying through PostgreSQL's JSON operators

**Section sources**
- [graph_store.py:128-221](file://backend/app/services/graph_store.py#L128-L221)
- [graph_db.py:39-58](file://backend/app/models/graph_db.py#L39-L58)

### Edge CRUD Operations

Edge management provides relationship modeling with temporal attributes:

```mermaid
classDiagram
class Edge {
+UUID uuid
+String graph_id
+Text name
+Text fact
+UUID source_node_uuid
+UUID target_node_uuid
+JSONB attributes
+DateTime valid_at
+DateTime invalid_at
+DateTime expired_at
+DateTime created_at
}
class GraphStore {
+add_edge(graph_id, name, fact, source_uuid, target_uuid, attributes) String
+get_all_edges(graph_id, limit, offset) Dict[]
+get_node_edges(uuid) Dict[]
}
Edge --> Node : "connects"
GraphStore --> Edge : "manages"
```

**Diagram sources**
- [graph_store.py:224-255](file://backend/app/services/graph_store.py#L224-L255)
- [graph_db.py:61-85](file://backend/app/models/graph_db.py#L61-L85)

The edge system supports temporal relationships through validity timestamps, enabling historical graph analysis and change tracking.

**Section sources**
- [graph_store.py:224-255](file://backend/app/services/graph_store.py#L224-L255)
- [graph_db.py:61-85](file://backend/app/models/graph_db.py#L61-L85)

### Search Functionality

The GraphStore implements PostgreSQL full-text search capabilities for efficient graph querying:

```mermaid
flowchart TD
SearchRequest["search(query, scope, limit)"] --> ParseQuery["Parse and normalize query"]
ParseQuery --> ScopeCheck{"Scope selection"}
ScopeCheck --> |Edges| SearchEdges["ILIKE search on edge facts"]
ScopeCheck --> |Nodes| SearchNodes["ILIKE search on node names/summaries"]
ScopeCheck --> |Both| SearchBoth["Execute both searches"]
SearchEdges --> CollectResults["Collect edge results"]
SearchNodes --> CollectResults2["Collect node results"]
SearchBoth --> CollectResults3["Collect both results"]
CollectResults --> FormatResponse["Format response with facts"]
CollectResults2 --> FormatResponse
CollectResults3 --> FormatResponse
FormatResponse --> ReturnResults["Return search results"]
```

**Diagram sources**
- [graph_store.py:259-316](file://backend/app/services/graph_store.py#L259-L316)

The search system combines:
- Case-insensitive pattern matching using ILIKE operators
- Keyword extraction and normalization
- Structured result formatting with facts, edges, and nodes
- Configurable result limits for performance optimization

**Section sources**
- [graph_store.py:259-316](file://backend/app/services/graph_store.py#L259-L316)

### Graph Statistics Collection

The GraphStore provides comprehensive statistics collection for graph analysis:

```mermaid
flowchart TD
GetStats["get_graph_statistics(graph_id)"] --> CountNodes["COUNT nodes"]
GetStats --> CountEdges["COUNT edges"]
GetStats --> CountEpisodes["COUNT episodes"]
GetStats --> CountProcessed["COUNT processed episodes"]
CountNodes --> GetOntology["Get graph ontology"]
CountEdges --> AnalyzeEntities["Analyze entity type distribution"]
CountEpisodes --> CalculateMetrics["Calculate processing metrics"]
CountProcessed --> CalculateMetrics
GetOntology --> AggregateResults["Aggregate statistics"]
AnalyzeEntities --> AggregateResults
CalculateMetrics --> AggregateResults
AggregateResults --> ReturnStats["Return comprehensive statistics"]
```

**Diagram sources**
- [graph_store.py:320-350](file://backend/app/services/graph_store.py#L320-L350)

Statistics include:
- Basic counts (nodes, edges, episodes)
- Processing status metrics
- Entity type distributions
- Ontology availability indicators

**Section sources**
- [graph_store.py:320-350](file://backend/app/services/graph_store.py#L320-L350)

## Dependency Analysis

The Graph Store service exhibits clean dependency relationships with minimal coupling:

```mermaid
graph LR
subgraph "External Dependencies"
SQLAlchemy[SQLAlchemy ORM]
PostgreSQL[PostgreSQL Database]
LLM[LLM Client]
end
subgraph "Internal Dependencies"
GraphStore[GraphStore]
Models[ORM Models]
Services[Service Layer]
Utils[Utility Functions]
end
GraphStore --> Models
GraphStore --> Utils
Services --> GraphStore
Services --> Utils
Models --> SQLAlchemy
Models --> PostgreSQL
Services --> LLM
GraphStore -.->|"uses"| GraphStore
Services -.->|"depends on"| GraphStore
```

**Diagram sources**
- [graph_store.py:12-16](file://backend/app/services/graph_store.py#L12-L16)
- [graph_db.py:1-21](file://backend/app/models/graph_db.py#L1-L21)

Key dependency characteristics:
- **Low Coupling**: Services depend on abstractions rather than concrete implementations
- **High Cohesion**: Related functionality is grouped within cohesive modules
- **Clear Interfaces**: Well-defined method signatures and return types
- **Minimal External Dependencies**: Only essential libraries (SQLAlchemy, PostgreSQL)

**Section sources**
- [graph_store.py:1-375](file://backend/app/services/graph_store.py#L1-L375)
- [graph_db.py:1-151](file://backend/app/models/graph_db.py#L1-L151)

## Performance Considerations

The Graph Store service is designed with performance optimization in mind:

### Database Design Optimizations

The ORM models implement strategic indexing for optimal query performance:

```mermaid
erDiagram
GRAPHS {
String graph_id PK
String name
Text description
JSONB ontology
DateTime created_at
}
NODES {
UUID uuid PK
String graph_id FK
Text name
Array labels
Text summary
JSONB attributes
DateTime created_at
}
EDGES {
UUID uuid PK
String graph_id FK
Text name
Text fact
UUID source_node_uuid
UUID target_node_uuid
JSONB attributes
DateTime valid_at
DateTime invalid_at
DateTime expired_at
DateTime created_at
}
EPISODES {
UUID uuid PK
String graph_id FK
Text content
String type
Boolean processed
Text error
DateTime created_at
}
GRAPHS ||--o{ NODES : "contains"
GRAPHS ||--o{ EDGES : "contains"
GRAPHS ||--o{ EPISODES : "contains"
NODES ||--o{ EDGES : "connects"
```

**Diagram sources**
- [graph_db.py:24-105](file://backend/app/models/graph_db.py#L24-L105)

### Concurrency and Transaction Management

The service handles concurrent access through:
- **Session-based Transactions**: Each operation runs within isolated database sessions
- **Connection Pooling**: Configured with pool_size=10 and max_overflow=20
- **Automatic Rollback**: Exception handling ensures transaction safety
- **Context Managers**: Proper resource cleanup through context managers

### Pagination and Large Dataset Handling

For large graphs, the service implements:
- **Configurable Limits**: Default limits of 2000 nodes and 5000 edges per page
- **Offset-based Pagination**: Efficient for moderate dataset sizes
- **Batch Processing**: Episode processing in configurable batch sizes
- **Progressive Loading**: Asynchronous processing prevents blocking operations

### Memory Management

The service optimizes memory usage through:
- **Lazy Loading**: Relationships loaded only when accessed
- **Streaming Results**: Large result sets processed incrementally
- **Resource Cleanup**: Automatic cleanup of database sessions and connections

**Section sources**
- [graph_db.py:113-151](file://backend/app/models/graph_db.py#L113-L151)
- [graph_store.py:195-211](file://backend/app/services/graph_store.py#L195-L211)

## Troubleshooting Guide

### Common Issues and Solutions

#### Database Connection Problems
**Symptoms**: Application fails to start or throws database connection errors
**Causes**: 
- PostgreSQL server not running
- Incorrect DATABASE_URL configuration
- Network connectivity issues

**Solutions**:
1. Verify PostgreSQL is running: `docker compose up -d postgres`
2. Check DATABASE_URL format: `postgresql://user:password@host:port/database`
3. Test connection manually using psql client
4. Review database logs for authentication errors

#### Session Management Issues
**Symptoms**: Database locks or transaction timeouts during concurrent operations
**Causes**:
- Long-running transactions
- Missing session cleanup
- Deadlock conditions

**Solutions**:
1. Ensure all database operations use context managers
2. Keep transactions short-lived
3. Implement proper error handling with rollback
4. Monitor for connection pool exhaustion

#### Performance Degradation
**Symptoms**: Slow query responses or memory leaks
**Causes**:
- Missing database indexes
- Large result set without pagination
- Inefficient query patterns

**Solutions**:
1. Verify database indexes exist for frequently queried columns
2. Implement pagination for large datasets
3. Optimize query patterns to use appropriate filters
4. Monitor query execution plans

#### LLM Processing Failures
**Symptoms**: Episodes stuck in pending state or extraction errors
**Causes**:
- LLM API rate limiting
- Network connectivity issues
- Invalid prompt formatting

**Solutions**:
1. Check LLM API credentials and quotas
2. Implement retry logic with exponential backoff
3. Validate prompt formatting and content
4. Monitor LLM service availability

**Section sources**
- [graph_store.py:370-375](file://backend/app/services/graph_store.py#L370-L375)
- [graph_db.py:138-151](file://backend/app/models/graph_db.py#L138-L151)
- [logger.py:1-127](file://backend/app/utils/logger.py#L1-L127)

### Error Handling Patterns

The Graph Store implements comprehensive error handling:

```mermaid
flowchart TD
Operation["Database Operation"] --> TryBlock["Try Block"]
TryBlock --> Success{"Operation Success?"}
Success --> |Yes| Commit["Commit Transaction"]
Success --> |No| CatchException["Catch Exception"]
CatchException --> Rollback["Rollback Transaction"]
Rollback --> LogError["Log Error Details"]
LogError --> RaiseError["Raise Exception"]
Commit --> Cleanup["Cleanup Resources"]
Cleanup --> ReturnSuccess["Return Success"]
RaiseError --> ReturnFailure["Return Failure"]
```

**Diagram sources**
- [graph_db.py:138-151](file://backend/app/models/graph_db.py#L138-L151)

Error handling characteristics:
- **Automatic Rollback**: Exceptions trigger transaction rollback
- **Resource Cleanup**: Sessions are properly closed
- **Detailed Logging**: Comprehensive error information captured
- **Graceful Degradation**: Operations fail safely without data corruption

**Section sources**
- [graph_db.py:138-151](file://backend/app/models/graph_db.py#L138-L151)
- [logger.py:1-127](file://backend/app/utils/logger.py#L1-L127)

## Conclusion

The Graph Store service provides a robust, scalable solution for graph data management that successfully replaces Zep Cloud API functionality with local PostgreSQL operations. The service demonstrates excellent architectural design through its modular structure, comprehensive error handling, and performance optimizations.

Key strengths of the implementation include:
- **Complete Feature Coverage**: Full support for graph lifecycle, CRUD operations, and search functionality
- **Scalable Architecture**: Designed for concurrent access and large dataset handling
- **Comprehensive Error Management**: Robust error handling with detailed logging
- **Flexible Data Model**: JSONB support enables dynamic schema evolution
- **Asynchronous Processing**: Non-blocking operations for improved responsiveness

The service is well-suited for knowledge graph applications requiring local data persistence, with clear pathways for extension and customization. The modular design facilitates future enhancements such as advanced analytics, graph algorithms, and additional search capabilities.

Future enhancement opportunities include:
- Implementation of graph algorithms and analytics
- Advanced indexing strategies for improved query performance
- Support for graph partitioning and sharding
- Enhanced monitoring and observability features
- Additional search modalities beyond full-text search