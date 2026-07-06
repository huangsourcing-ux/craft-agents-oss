# Fork Changes

## 2026-07-06

- [FORK] Added managed OpenRouter LLM bootstrap for company deployments. When `WUDI_MANAGED_LLM=true`, the headless server validates `OPENROUTER_API_KEY`, upserts the hidden `system-openrouter` connection, sets `pi/deepseek/deepseek-v4-flash` as the default model, and clears workspace-level default connection overrides.
- [FORK] Added `VITE_WUDI_MANAGED_LLM` renderer mode, enabled by default, so employee login skips local model onboarding and hides model/API account configuration controls.
- [FORK] Added OpenRouter DeepSeek V4 Flash preferred default ordering to keep model refreshes from drifting away from the managed default.
