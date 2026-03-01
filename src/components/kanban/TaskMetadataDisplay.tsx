import type { TaskMetadata } from '@/lib/markdown/types'
import type { CardDisplayPreferences } from '@/store/preferences-store'
import {
  getLabelColor,
  getDueDateStatus,
  formatDueDate,
  getInitials,
  getAvatarColor,
} from '@/lib/utils/metadata-colors'
import { Calendar, Clock } from 'lucide-react'

interface TaskMetadataDisplayProps {
  metadata: TaskMetadata
  prefs: CardDisplayPreferences
  getGroupForLabel?: (label: string) => { group: string; value: string } | null
}

export function TaskMetadataDisplay({ metadata, prefs, getGroupForLabel }: TaskMetadataDisplayProps) {
  const hasLabels = prefs.showLabels && metadata.labels.length > 0
  const hasAssignees = prefs.showAssignees && metadata.assignees.length > 0
  const hasDueDate = prefs.showDueDate && metadata.dueDate !== null
  const hasPriority = prefs.showPriority && metadata.priority !== null
  const hasEstimate = prefs.showEstimate && metadata.estimate !== null
  const hasSignatures = prefs.showSignatures && (metadata.createdBy || metadata.builtBy)

  const hasAnything = hasLabels || hasAssignees || hasDueDate || hasPriority || hasEstimate || hasSignatures
  if (!hasAnything) return null

  const dueDateStatus = metadata.dueDate ? getDueDateStatus(metadata.dueDate) : null

  return (
    <div className="mt-2 ml-9 flex flex-col gap-1.5">
      {/* Priority + Labels row */}
      {(hasPriority || hasLabels) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {hasPriority && (
            <span
              className={`size-2 rounded-full shrink-0 ${
                metadata.priority === 'high'
                  ? 'bg-red-500'
                  : metadata.priority === 'medium'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
            />
          )}
          {hasLabels &&
            metadata.labels.map((label) => {
              const group = getGroupForLabel?.(label)
              if (group) {
                // Grouped label — render as pipeline/badge style
                return (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 capitalize"
                  >
                    {group.value.replace(/-/g, ' ')}
                  </span>
                )
              }
              const color = getLabelColor(label)
              return (
                <span
                  key={label}
                  className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}
                >
                  {label}
                </span>
              )
            })}
        </div>
      )}

      {/* Due date + Estimate + Assignees row */}
      {(hasDueDate || hasEstimate || hasAssignees) && (
        <div className="flex items-center gap-2 flex-wrap">
          {hasDueDate && metadata.dueDate && (
            <span
              className={`inline-flex items-center gap-1 text-[10px] ${
                dueDateStatus === 'overdue'
                  ? 'text-red-600 dark:text-red-400 font-medium'
                  : dueDateStatus === 'soon'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground'
              }`}
            >
              <Calendar className="size-3" />
              {formatDueDate(metadata.dueDate)}
            </span>
          )}
          {hasEstimate && metadata.estimate !== null && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {metadata.estimate}h
            </span>
          )}
          {hasAssignees &&
            metadata.assignees.map((assignee) => (
              <span
                key={assignee}
                className={`inline-flex items-center justify-center size-5 rounded-full text-[9px] font-bold text-white ${getAvatarColor(assignee)}`}
                title={assignee}
              >
                {getInitials(assignee)}
              </span>
            ))}
        </div>
      )}

      {/* Signatures row */}
      {hasSignatures && (
        <div className="text-[10px] text-muted-foreground/60">
          {metadata.createdBy && <span>by {metadata.createdBy}</span>}
          {metadata.createdBy && metadata.builtBy && <span> · </span>}
          {metadata.builtBy && <span>built by {metadata.builtBy}</span>}
        </div>
      )}
    </div>
  )
}
