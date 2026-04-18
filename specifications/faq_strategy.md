# Specification: Offline FAQ & Search Architecture

> **Status: PARKED / SKETCH**  
> **Purpose:** A blueprint for an ultra-lightweight, zero-cost, fully offline semantic search engine for processing user support queries, completely bypassing the need for an external LLM.

## 1. Architectural Philosophy
Most modern apps rely on massive LLM embeddings to handle natural language support queries. In a tactical, local-first environment like War Cabinet, this introduces unacceptable bloat (20MB+ ONNX models) or reliance on a network connection.

Instead, we emulate "Semantic Understanding" locally using tiny algorithms and intelligent data structures.

---

## 2. The Core Engine (`Fuse.js`)
We use a standard fuzzy text-matching library (e.g., `Fuse.js`). 
*   **Footprint:** Barely a few kilobytes.
*   **Mechanism:** It relies on the Bitap algorithm to match text strings while intelligently ignoring typos (e.g., identifying that "freezr" means "freezer").
*   **Offline First:** Operates instantly in memory without a network connection.

---

## 3. The "Semantic" Bridge (Tag Mapping)
Fuzzy search typically fails if the user queries a word that isn’t directly in the answer text. We solve this by attaching hidden arrays of metadata to each question (mapped via `faq_tags.md`).

When the search engine is queried, we instruct it to silently scan the hidden `tags` alongside the question body.
*   *If a user types "budget", they might miss the question body, but they hit the hidden `cost-intelligence` tag, returning perfectly relevant results.*

---

## 4. The Pre-Processor (Bidirectional Synonym Clusters)
To further emulate true Native Language Processing (NLP), user queries are intercepted *before* they are sent to the search engine.

Instead of naive direct key-value pairs (which only work in one direction), we define an array of **Synonym Clusters**:
```javascript
const clusters = [
  ["delete", "remove", "bin", "trash"],
  ["refrigerator", "fridge", "cooler"],
  ["cost", "price", "money", "inflation"],
  ["rotten", "expired", "bad", "waste", "mouldy"]
];
```
**The Execution:**
When the app boots up, a 5-line initialization loop automatically flattens these arrays into a bidirectional lookup map. 

If a user types: *"I need to bin my rotten apple"*
The pre-processor detects that "bin" is in Cluster 1 and "rotten" is in Cluster 4. It silently mutates the search string invisibly to: *"I need to [delete, remove, trash] my [expired, bad, waste, mouldy] apple"*

The engine processes this expanded string and mathematically guarantees a hit for: *"How do I properly record items I threw in the bin because they rotted/expired?"*

---

## 5. The Telemetry Flywheel (Self-Healing FAQ)
To guarantee the FAQ estate mirrors reality, we deploy a "Did this answer your question?" (Yes/No) prompt beneath rendered answers.

**The Failure Catch:**
If the user selects "No" (or if a search returns 0 results), the app executes a silent, Fire-and-Forget telemetry ping safely passing the raw query.

```javascript
fetch('https://your-server.com/api/failed-queries', {
   method: 'POST',
   body: JSON.stringify({ query: userSearchText })
}).catch(() => {
   // Silently fails if offline to preserve UX.
});
```

**The Loop:**
The commander evaluates the logs periodically. If multiple users search for an unsupported concept, the commander writes the missing FAQ natively into the Markdown, assigns semantic tags, and patches it in the next update.

The FAQ strategy remains strictly deterministic, lightning-fast, and entirely private.
