# Specification: Multi-User Collaboration (Field Marshall Tier)

## 1. Objective
Enable decentralized, offline-first synchronization between multiple devices (e.g., family members or tactical teams) to allow collaborative inventory management without a central cloud dependency.

## 2. Core Topology (Commander & Operative)
*   **The Commander**: Acts as the Master Node (Source of Truth). Broadcasts an mDNS signal for local discovery.
*   **The Operative**: Joins the mesh via a QR handshake. Maintains a local outbox of actions and syncs with the Commander upon discovery.

## 3. Requirement: Local View Filters ("Hide" Mode)
As part of the multi-user experience, individual operatives must be able to customize their view of the War Cabinet without affecting the global state.

### 3.1 User Need
A user (e.g., a specific family member) may only be responsible for certain categories of supplies (e.g., medical or pantry) and finds a 500-item catalog overwhelming for daily use.

### 3.2 Feature Nuance: Per-Device Visibility
*   **The "Hide" Toggle**: Users can flag specific **Cabinets**, **Categories**, or **Item Types** as "Hidden."
*   **Scope**: This setting is **strictly local** to the specific installation of the app. Hiding a cabinet on Operative A's phone does not hide it on the Commander's dashboard or Operative B's phone.
*   **UI Impact**: Hidden assets are removed from the main Catalog, Logistics, and Dashboard views for that user, providing a "simplified" or "focused" interface tailored to their specific responsibilities.
*   **Persistence**: These visibility preferences are stored in the local `Settings` table or `SecureStore`, ensuring they persist through sync cycles but do not propagate across the mesh.

## 4. Technical Constraints
*   **Sync Logic**: Even if an item is "Hidden" on a device, its data must still be synced in the background to ensure the local database remains a complete replica for ledger reconciliation.
*   **Emergency Overrides**: A "Show All" master toggle should be available in settings to allow users to quickly view the full tactical picture if needed.
