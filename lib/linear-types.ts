export interface LinearLabel {
  id: string
  name: string
  color: string
}

export interface LinearState {
  id: string
  name: string
  color: string
  type: 'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled'
}

export interface LinearAssignee {
  name: string
  avatarUrl?: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  priority: 0 | 1 | 2 | 3 | 4 // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  url: string
  updatedAt: string
  description?: string
  state: LinearState
  labels: { nodes: LinearLabel[] }
  assignee?: LinearAssignee
}

export const PRIORITY_CONFIG = {
  0: { label: 'No priority', color: 'text-zinc-500', icon: '—' },
  1: { label: 'Urgent', color: 'text-red-400', icon: '!!', dotColor: 'bg-red-500' },
  2: { label: 'High', color: 'text-orange-400', icon: '↑', dotColor: 'bg-orange-500' },
  3: { label: 'Medium', color: 'text-yellow-400', icon: '→', dotColor: 'bg-yellow-500' },
  4: { label: 'Low', color: 'text-blue-400', icon: '↓', dotColor: 'bg-blue-500' },
} as const

export const STATE_ORDER: Record<string, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  triage: 3,
}
