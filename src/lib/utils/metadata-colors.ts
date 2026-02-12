const LABEL_COLORS = [
  { bg: 'bg-blue-500/15 dark:bg-blue-500/25', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-500/20 dark:border-blue-500/30' },
  { bg: 'bg-emerald-500/15 dark:bg-emerald-500/25', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/20 dark:border-emerald-500/30' },
  { bg: 'bg-violet-500/15 dark:bg-violet-500/25', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-500/20 dark:border-violet-500/30' },
  { bg: 'bg-amber-500/15 dark:bg-amber-500/25', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-500/20 dark:border-amber-500/30' },
  { bg: 'bg-rose-500/15 dark:bg-rose-500/25', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-500/20 dark:border-rose-500/30' },
  { bg: 'bg-cyan-500/15 dark:bg-cyan-500/25', text: 'text-cyan-700 dark:text-cyan-300', border: 'border-cyan-500/20 dark:border-cyan-500/30' },
  { bg: 'bg-orange-500/15 dark:bg-orange-500/25', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-500/20 dark:border-orange-500/30' },
  { bg: 'bg-pink-500/15 dark:bg-pink-500/25', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-500/20 dark:border-pink-500/30' },
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

export function getLabelColor(label: string) {
  return LABEL_COLORS[hashString(label) % LABEL_COLORS.length]
}

export function getDueDateStatus(dueDate: string): 'overdue' | 'soon' | 'normal' {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return 'overdue'
  if (diffDays <= 3) return 'soon'
  return 'normal'
}

export function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
]

export function getAvatarColor(name: string): string {
  return AVATAR_COLORS[hashString(name) % AVATAR_COLORS.length]
}
