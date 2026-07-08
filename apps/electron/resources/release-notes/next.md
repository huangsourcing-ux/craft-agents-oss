# Pending Release Notes

This file accumulates release notes for the next unreleased version. PRs that add user-visible behavior should append a bullet to the relevant section here. Versioned files (`X.Y.Z.md`) are owned by the release skill — never create them in feature commits.

## Features

## Improvements

- **Simplified login screen** — The employee login screen keeps the existing WudiBuddy logo and now shows only the minimal account, password, placeholder, and `登录WudiBuddy Agents` copy in the default form state.
- **Large local attachments** — Dragging or selecting a large local file now keeps a filesystem path reference instead of freezing the renderer while converting the file to base64. This lets large Excel workbooks be handled by agent-side scripts and document tools when the workspace server can access the path.

## Bug Fixes

## Breaking Changes
