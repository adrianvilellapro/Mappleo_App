"use client";
export const workspaceChangeEvent = "mappleo:workspace-changed";
export function notifyWorkspaceChange() {
  window.dispatchEvent(new CustomEvent(workspaceChangeEvent));
}
