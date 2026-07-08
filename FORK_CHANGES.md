# Fork Changes

## 2026-07-08

- [FORK] Simplified the Electron and WebUI employee login screens to keep the existing WudiBuddy logo while showing only the minimal account, password, placeholder, and `登录WudiBuddy Agents` copy in the default form state.
- [FORK] Added path-only handling for large local attachments. Files over the existing 20 MB inline limit that come from the OS file picker or drag-drop keep their user-authorized filesystem path instead of being base64-encoded and pre-converted, so large Excel workbooks can be handled by agent-side Python/xlsx tooling.

## 2026-07-07

- [FORK] Changed employee managed mode from "remote workspace" to "local workspace + server-managed model proxy". Employee login now syncs the `system-openrouter` LLM connection through auth-gateway and keeps the current local workspace selected.
- [FORK] Restored native workspace visibility and switching in managed mode so local files, local Sources, user-added MCP servers, and user-added API connections remain available.
- [FORK] Added a `system-openrouter` setup template for the local proxy connection. The stored local credential is the employee JWT; the upstream OpenRouter key remains on the backend.
- [FORK] Added managed backend MCP source sync for local workspaces. Employee sessions now upsert the `wudi-backend` HTTP MCP source and store only the employee JWT in the local source credential store.

## 2026-07-06

- [FORK] Added managed OpenRouter LLM bootstrap for company deployments. When `WUDI_MANAGED_LLM=true`, the headless server validates `OPENROUTER_API_KEY`, upserts the hidden `system-openrouter` connection, sets `pi/deepseek/deepseek-v4-flash` as the default model, and clears workspace-level default connection overrides.
- [FORK] Added `VITE_WUDI_MANAGED_LLM` renderer mode, enabled by default, so employee login skips local model onboarding and hides model/API account configuration controls.
- [FORK] Added OpenRouter DeepSeek V4 Flash preferred default ordering to keep model refreshes from drifting away from the managed default.
