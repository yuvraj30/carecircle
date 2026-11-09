// Transient navigation intent; task data remains in the app state.
let pendingTaskId: string | null = null
export function focusTask(id: string) { pendingTaskId = id }
export function consumeFocusedTask() { const id = pendingTaskId; pendingTaskId = null; return id }
