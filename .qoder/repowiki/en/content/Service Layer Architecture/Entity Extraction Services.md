# Entity Extraction Services

<cite>
**Referenced Files in This Document**
- [entity_extractor.py](file://backend/app/services/entity_extractor.py)
- [entity_reader.py](file://backend/app/services/entity_reader.py)
- [extraction_worker.py](file://backend/app/services/extraction_worker.py)
- [graph_store.py](file://backend/app/services/graph_store.py)
- [graph_db.py](file://backend/app/models/graph_db.py)
- [llm_client.py](file://backend/app/utils/llm_client.py)
- [retry.py](file://backend/app/utils/retry.py)
- [config.py](file://backend/app/config.py)
- [graph.py](file://backend/app/api/graph.py)
- [text_processor.py](file://backend/app/services/text_processor.py)
- [file_parser.py](file://backend/app/utils/file_parser.py)
- [task.py](file://backend/app/models/task.py)
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
10. [Appendices](#appendices)

## Introduction
This document explains the entity extraction ecosystem that transforms raw text into a structured knowledge graph. It covers three core services:
- Entity Extractor: identifies and extracts named entities and relationships from text using LLM analysis.
- Entity Reader: reads and filters structured graph data, returning enriched entity representations.
- Extraction Worker: orchestrates background processing of text chunks (episodes) and coordinates asynchronous LLM extraction.

It also documents the pipeline from ingestion to structured output, including entity type classification, relationship mapping, attribute extraction, validation rules, performance tuning, error handling, and quality metrics.

## Project Structure
The entity extraction services reside in the backend Python application and integrate with a PostgreSQL-backed graph store, an LLM client, and a task management system. The API layer coordinates ingestion, chunking, and orchestration.

```mermaid
graph TB
subgraph "API Layer"
API["graph.py<br/>Endpoints and orchestration"]
end
subgraph "Services"
TE["TextProcessor<br/>text_processor.py"]
EP["ExtractionWorker<br/>extraction_worker.py"]
EE["EntityExtractor<br/>entity_extractor.py"]
ER["EntityReader<br/>entity_reader.py"]
end
subgraph "Storage"
GS["GraphStore<br/>graph_store.py"]
DB["Graph Models<br/>graph_db.py"]
end
subgraph "Utilities"
LLM["LLMClient<br/>llm_client.py"]
CFG["Config<br/>config.py"]
RT["Retry Utilities<br/>retry.py"]
TP["Task Manager<br/>task.py"]
end
FP["FileParser<br/>file_parser.py"]
API --> TE
API --> EP
API --> GS
API --> TP
TE --> FP
EP --> EE
EE --> LLM
EE --> GS
ER --> GS
GS --> DB
CFG --> LLM
CFG --> GS
```

**Diagram sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [text_processor.py:1-72](file://backend/app/services/text_processor.py#L1-L72)
- [extraction_worker.py:1-109](file://backend/app/services/extraction_worker.py#L1-L109)
- [entity_extractor.py:1-291](file://backend/app/services/entity_extractor.py#L1-L291)
- [entity_reader.py:1-345](file://backend/app/services/entity_reader.py#L1-L345)
- [graph_store.py:1-375](file://backend/app/services/graph_store.py#L1-L375)
- [graph_db.py:1-151](file://backend/app/models/graph_db.py#L1-L151)
- [llm_client.py:1-104](file://backend/app/utils/llm_client.py#L1-L104)
- [config.py:1-76](file://backend/app/config.py#L1-L76)
- [retry.py:1-239](file://backend/app/utils/retry.py#L1-L239)
- [task.py:1-185](file://backend/app/models/task.py#L1-L185)
- [file_parser.py:1-190](file://backend/app/utils/file_parser.py#L1-L190)

**Section sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [text_processor.py:1-72](file://backend/app/services/text_processor.py#L1-L72)
- [file_parser.py:1-190](file://backend/app/utils/file_parser.py#L1-L190)

## Core Components
- Entity Extractor: Builds extraction prompts using graph ontology, queries the LLM, parses JSON results, and persists nodes and edges to the graph store. It deduplicates entities and auto-creates missing nodes referenced in relationships.
- Entity Reader: Filters nodes by custom labels (excluding default “Entity”/“Node”), enriches entities with related edges and neighbor nodes, and exposes typed collections for downstream consumption.
- Extraction Worker: Polls for pending episodes, processes them asynchronously, and reports progress via callbacks. It integrates with the graph store to mark episodes processed and capture errors.

**Section sources**
- [entity_extractor.py:16-291](file://backend/app/services/entity_extractor.py#L16-L291)
- [entity_reader.py:69-345](file://backend/app/services/entity_reader.py#L69-L345)
- [extraction_worker.py:16-109](file://backend/app/services/extraction_worker.py#L16-L109)

## Architecture Overview
The pipeline begins with file uploads and text preprocessing, followed by chunking and graph creation. An ontology defines entity and relationship types. Episodes are enqueued and processed asynchronously by the Extraction Worker, which delegates to the Entity Extractor. Results are stored in the graph store and later read by the Entity Reader for visualization and reporting.

```mermaid
sequenceDiagram
participant Client as "Client"
participant API as "graph.py"
participant TP as "TextProcessor"
participant FP as "FileParser"
participant GB as "GraphBuilderService"
participant GS as "GraphStore"
participant EW as "ExtractionWorker"
participant EE as "EntityExtractor"
participant LLM as "LLMClient"
Client->>API : "POST /build"
API->>TP : "split_text()"
TP->>FP : "extract_from_multiple()"
API->>GB : "create_graph(), set_ontology()"
API->>GS : "add_episode_batch()"
API->>EW : "wait_for_episodes()"
loop "for each pending episode"
EW->>EE : "extract_from_episode()"
EE->>GS : "get_ontology(), get_pending_episodes()"
EE->>LLM : "chat_json(prompt)"
LLM-->>EE : "JSON {entities, relationships}"
EE->>GS : "find_node_by_name()/add_node()"
EE->>GS : "add_edge()"
EE->>GS : "mark_episode_processed()"
end
API-->>Client : "Task progress/results"
```

**Diagram sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [text_processor.py:18-34](file://backend/app/services/text_processor.py#L18-L34)
- [file_parser.py:124-144](file://backend/app/utils/file_parser.py#L124-L144)
- [graph_store.py:75-124](file://backend/app/services/graph_store.py#L75-L124)
- [extraction_worker.py:30-109](file://backend/app/services/extraction_worker.py#L30-L109)
- [entity_extractor.py:26-167](file://backend/app/services/entity_extractor.py#L26-L167)
- [llm_client.py:70-104](file://backend/app/utils/llm_client.py#L70-L104)

## Detailed Component Analysis

### Entity Extractor
Responsibilities:
- Construct extraction prompts using defined entity and relationship types from the graph ontology.
- Call the LLM with a structured JSON request and parse the response.
- Deduplicate entities by name and type within the graph; create nodes with labels and attributes.
- Resolve relationship endpoints by name/type, auto-creating missing nodes if needed.
- Persist edges with facts and attributes; mark episodes processed and record errors.

Key workflows:
- Episode-based extraction: fetches a single episode, builds prompt, calls LLM, stores nodes and edges, marks processed.
- Direct text extraction: same as above but operates on arbitrary text without episodes.

```mermaid
flowchart TD
Start(["extract_from_episode()"]) --> GetPending["Get pending episodes"]
GetPending --> Found{"Episode found?"}
Found -- No --> LogWarn["Log warning and return"]
Found -- Yes --> LoadOnt["Load ontology types"]
LoadOnt --> BuildPrompt["Build extraction prompt"]
BuildPrompt --> CallLLM["LLM chat_json()"]
CallLLM --> ParseResp["Parse entities and relationships"]
ParseResp --> Dedup["Deduplicate by name+type"]
Dedup --> StoreNodes["Store nodes (labels, summary, attributes)"]
StoreNodes --> ResolveRels["Resolve source/target nodes"]
ResolveRels --> StoreEdges["Store edges (fact, attributes)"]
StoreEdges --> MarkDone["Mark episode processed"]
MarkDone --> End(["Done"])
Start2(["extract_from_text()"]) --> LoadOnt2["Load or accept ontology"]
LoadOnt2 --> BuildPrompt2["Build extraction prompt"]
BuildPrompt2 --> CallLLM2["LLM chat_json()"]
CallLLM2 --> ParseResp2["Parse entities and relationships"]
ParseResp2 --> StoreNodes2["Store nodes"]
StoreNodes2 --> ResolveRels2["Resolve nodes and store edges"]
ResolveRels2 --> End2(["Return counts"])
```

**Diagram sources**
- [entity_extractor.py:26-167](file://backend/app/services/entity_extractor.py#L26-L167)
- [entity_extractor.py:168-245](file://backend/app/services/entity_extractor.py#L168-L245)

**Section sources**
- [entity_extractor.py:16-291](file://backend/app/services/entity_extractor.py#L16-L291)
- [llm_client.py:70-104](file://backend/app/utils/llm_client.py#L70-L104)
- [graph_store.py:166-182](file://backend/app/services/graph_store.py#L166-L182)
- [graph_store.py:224-247](file://backend/app/services/graph_store.py#L224-L247)

### Entity Reader
Responsibilities:
- Retrieve all nodes and edges for a graph.
- Filter nodes by custom labels (excluding default “Entity”/“Node”) to produce defined entities.
- Enrich entities with related edges and neighboring nodes.
- Provide typed collections and single-entity context retrieval.

```mermaid
classDiagram
class EntityNode {
+string uuid
+string name
+string[] labels
+string summary
+Dict attributes
+List related_edges
+List related_nodes
+to_dict() Dict
+get_entity_type() string
}
class FilteredEntities {
+EntityNode[] entities
+Set~string~ entity_types
+int total_count
+int filtered_count
+to_dict() Dict
}
class EntityReader {
+get_all_nodes(graph_id) Dict[]
+get_all_edges(graph_id) Dict[]
+get_node_edges(node_uuid) Dict[]
+filter_defined_entities(graph_id, defined_entity_types, enrich_with_edges) FilteredEntities
+get_entity_with_context(graph_id, entity_uuid) EntityNode
+get_entities_by_type(graph_id, entity_type, enrich_with_edges) EntityNode[]
}
EntityReader --> EntityNode : "creates"
EntityReader --> FilteredEntities : "returns"
```

**Diagram sources**
- [entity_reader.py:20-67](file://backend/app/services/entity_reader.py#L20-L67)
- [entity_reader.py:69-345](file://backend/app/services/entity_reader.py#L69-L345)

**Section sources**
- [entity_reader.py:69-345](file://backend/app/services/entity_reader.py#L69-L345)
- [graph_store.py:195-221](file://backend/app/services/graph_store.py#L195-L221)

### Extraction Worker
Responsibilities:
- Continuously poll for pending episodes and process them via the Entity Extractor.
- Support progress callbacks and timeouts.
- Handle per-episode errors by marking episodes processed with error metadata.

```mermaid
flowchart TD
WStart(["process_all_pending()"]) --> Loop["While not timeout"]
Loop --> Pending["Get pending episodes"]
Pending --> HasPending{"Any pending?"}
HasPending -- No --> Done["Break and notify completion"]
HasPending -- Yes --> Iterate["Iterate episodes"]
Iterate --> Timeout{"Timeout reached?"}
Timeout -- Yes --> Notify["Notify partial progress and return"]
Timeout -- No --> Process["process_episode() -> extract_from_episode()"]
Process --> Sleep["Sleep briefly between batches"]
Sleep --> Loop
```

**Diagram sources**
- [extraction_worker.py:30-109](file://backend/app/services/extraction_worker.py#L30-L109)

**Section sources**
- [extraction_worker.py:16-109](file://backend/app/services/extraction_worker.py#L16-L109)

### Graph Store and Models
Graph Store provides a unified access layer for:
- Graph lifecycle (create/delete)
- Episode management (add, batch add, mark processed, list pending)
- Node CRUD (add, get, find by name, update, list with pagination)
- Edge CRUD (add, list)
- Search (full-text on facts/nodes)
- Statistics (counts and entity type distribution)
- Session management and pooling

Models define the schema for graphs, nodes, edges, and episodes with indexes and relationships.

```mermaid
erDiagram
GRAPHS {
string graph_id PK
string name
text description
jsonb ontology
timestamp created_at
}
NODES {
uuid uuid PK
string graph_id FK
text name
text[] labels
text summary
jsonb attributes
timestamp created_at
}
EDGES {
uuid uuid PK
string graph_id FK
text name
text fact
uuid source_node_uuid FK
uuid target_node_uuid FK
jsonb attributes
timestamp created_at
timestamp valid_at
timestamp invalid_at
timestamp expired_at
}
EPISODES {
uuid uuid PK
string graph_id FK
text content
string type
bool processed
text error
timestamp created_at
}
GRAPHS ||--o{ NODES : "contains"
GRAPHS ||--o{ EDGES : "contains"
GRAPHS ||--o{ EPISODES : "contains"
NODES ||--o{ EDGES : "source/target"
```

**Diagram sources**
- [graph_db.py:24-105](file://backend/app/models/graph_db.py#L24-L105)
- [graph_store.py:32-124](file://backend/app/services/graph_store.py#L32-L124)

**Section sources**
- [graph_store.py:21-375](file://backend/app/services/graph_store.py#L21-L375)
- [graph_db.py:1-151](file://backend/app/models/graph_db.py#L1-L151)

### LLM Client and Retry Utilities
- LLMClient wraps OpenAI-compatible APIs, supports JSON response parsing, and cleans up model-specific artifacts.
- Retry utilities provide exponential backoff with jitter and batch retry helpers for robust external API calls.

```mermaid
classDiagram
class LLMClient {
+string api_key
+string base_url
+string model
+chat(messages, temperature, max_tokens, response_format) string
+chat_json(messages, temperature, max_tokens) Dict
}
class Retry {
+retry_with_backoff(...)
+retry_with_backoff_async(...)
+RetryableAPIClient
}
LLMClient <.. Retry : "used by"
```

**Diagram sources**
- [llm_client.py:14-104](file://backend/app/utils/llm_client.py#L14-L104)
- [retry.py:15-239](file://backend/app/utils/retry.py#L15-L239)

**Section sources**
- [llm_client.py:14-104](file://backend/app/utils/llm_client.py#L14-L104)
- [retry.py:15-239](file://backend/app/utils/retry.py#L15-L239)

### API Orchestration and Task Management
- The API endpoint orchestrates text extraction, chunking, graph creation, and LLM processing.
- TaskManager tracks progress and results for long-running operations.

```mermaid
sequenceDiagram
participant C as "Client"
participant A as "graph.py"
participant T as "TaskManager"
participant G as "GraphBuilderService"
participant W as "ExtractionWorker"
C->>A : "POST /build {project_id,...}"
A->>T : "create_task()"
A->>G : "create_graph(), set_ontology()"
A->>G : "add_text_batches()"
A->>W : "wait_for_episodes()"
W->>W : "process_all_pending()"
A-->>C : "poll /task/{task_id}"
```

**Diagram sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [task.py:54-185](file://backend/app/models/task.py#L54-L185)

**Section sources**
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [task.py:54-185](file://backend/app/models/task.py#L54-L185)

## Dependency Analysis
- Entity Extractor depends on LLMClient for inference and GraphStore for persistence.
- Extraction Worker composes EntityExtractor and GraphStore.
- Entity Reader depends on GraphStore for node/edge retrieval.
- API layer coordinates TextProcessor/FileParser, GraphBuilderService, and TaskManager.
- GraphStore encapsulates SQLAlchemy models and session management.

```mermaid
graph LR
EE["EntityExtractor"] --> LLM["LLMClient"]
EE --> GS["GraphStore"]
EW["ExtractionWorker"] --> EE
EW --> GS
ER["EntityReader"] --> GS
API["graph.py"] --> TE["TextProcessor"]
API --> FP["FileParser"]
API --> GS
API --> TP["TaskManager"]
GS --> DB["graph_db.py models"]
```

**Diagram sources**
- [entity_extractor.py:22-24](file://backend/app/services/entity_extractor.py#L22-L24)
- [extraction_worker.py:22-24](file://backend/app/services/extraction_worker.py#L22-L24)
- [entity_reader.py:79-80](file://backend/app/services/entity_reader.py#L79-L80)
- [graph.py:259-523](file://backend/app/api/graph.py#L259-L523)
- [graph_store.py:27-28](file://backend/app/services/graph_store.py#L27-L28)
- [graph_db.py:24-105](file://backend/app/models/graph_db.py#L24-L105)

**Section sources**
- [entity_extractor.py:1-291](file://backend/app/services/entity_extractor.py#L1-L291)
- [entity_reader.py:1-345](file://backend/app/services/entity_reader.py#L1-L345)
- [extraction_worker.py:1-109](file://backend/app/services/extraction_worker.py#L1-L109)
- [graph_store.py:1-375](file://backend/app/services/graph_store.py#L1-L375)
- [graph_db.py:1-151](file://backend/app/models/graph_db.py#L1-L151)
- [llm_client.py:1-104](file://backend/app/utils/llm_client.py#L1-L104)
- [retry.py:1-239](file://backend/app/utils/retry.py#L1-L239)
- [graph.py:1-604](file://backend/app/api/graph.py#L1-L604)
- [task.py:1-185](file://backend/app/models/task.py#L1-L185)

## Performance Considerations
- Concurrency and batching:
  - Extraction Worker iterates episodes with a small inter-check sleep to avoid tight loops and reduce contention.
  - TextProcessor splits text with configurable chunk size and overlap to balance LLM context limits and recall.
- Memory optimization:
  - Pagination in GraphStore node/edge retrieval prevents loading entire graphs into memory at once.
  - EntityExtractor deduplicates entities by name+type to minimize redundant writes.
- LLM cost and latency:
  - Lower temperature during JSON calls improves determinism.
  - Prompt includes defined types to constrain outputs and improve accuracy.
- Database tuning:
  - SQLAlchemy session pooling and pre-ping reduce connection overhead.
  - Indexes on graph_id/name support efficient lookups.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
Common issues and remedies:
- LLM API failures:
  - Wrap LLM calls with retry decorators to apply exponential backoff and jitter.
  - Validate LLM configuration keys and base URLs.
- JSON parsing errors:
  - LLMClient strips code blocks and cleans responses; ensure the model returns valid JSON.
  - Consider adding post-hoc JSON repair strategies if needed.
- Extraction errors:
  - Extraction Worker marks episodes processed even on failure; inspect error fields and logs.
  - Verify that episodes are marked processed to prevent repeated work.
- Ontology mismatches:
  - Ensure entity and relationship types are set in the graph’s ontology before extraction.
  - Validate that entity types include fallbacks (Person/Organization) as recommended by the ontology generator.

**Section sources**
- [retry.py:15-129](file://backend/app/utils/retry.py#L15-L129)
- [llm_client.py:70-104](file://backend/app/utils/llm_client.py#L70-L104)
- [config.py:30-33](file://backend/app/config.py#L30-L33)
- [extraction_worker.py:82-88](file://backend/app/services/extraction_worker.py#L82-L88)
- [graph_store.py:106-124](file://backend/app/services/graph_store.py#L106-L124)

## Conclusion
The entity extraction ecosystem integrates ingestion, chunking, LLM-powered extraction, and graph persistence. Entity Extractor focuses on accurate entity and relationship identification guided by an ontology. Entity Reader provides filtered, enriched views for downstream applications. Extraction Worker ensures scalable, asynchronous processing with progress tracking and error handling. Together, these components form a robust pipeline for transforming raw text into a structured knowledge graph.

[No sources needed since this section summarizes without analyzing specific files]

## Appendices

### Extraction Pipeline Steps
- Upload and parse files.
- Preprocess and chunk text.
- Create graph and set ontology.
- Add episodes and wait for LLM extraction.
- Read and filter entities for visualization/reporting.

**Section sources**
- [graph.py:121-255](file://backend/app/api/graph.py#L121-L255)
- [text_processor.py:18-34](file://backend/app/services/text_processor.py#L18-L34)
- [file_parser.py:124-144](file://backend/app/utils/file_parser.py#L124-L144)
- [graph_store.py:32-124](file://backend/app/services/graph_store.py#L32-L124)
- [extraction_worker.py:30-109](file://backend/app/services/extraction_worker.py#L30-L109)
- [entity_reader.py:128-244](file://backend/app/services/entity_reader.py#L128-L244)

### Example Extraction Configurations
- LLM configuration:
  - API key, base URL, and model name are loaded from environment variables.
- Text chunking:
  - Adjust chunk size and overlap to balance context and cost.
- Extraction:
  - Use low temperature for JSON mode to improve consistency.

**Section sources**
- [config.py:30-45](file://backend/app/config.py#L30-L45)
- [llm_client.py:17-33](file://backend/app/utils/llm_client.py#L17-L33)
- [text_processor.py:18-34](file://backend/app/services/text_processor.py#L18-L34)

### Validation Rules and Quality Metrics
- Validation:
  - Entities require non-empty names; relationships require non-empty source/target.
  - Deduplicate by name and type to avoid redundancy.
- Metrics:
  - Track processed episode counts, node/edge counts, and entity type distributions via graph statistics.

**Section sources**
- [entity_extractor.py:68-91](file://backend/app/services/entity_extractor.py#L68-L91)
- [entity_extractor.py:226-242](file://backend/app/services/entity_extractor.py#L226-L242)
- [graph_store.py:320-350](file://backend/app/services/graph_store.py#L320-L350)