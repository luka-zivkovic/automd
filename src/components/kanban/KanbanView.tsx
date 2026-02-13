import { KanbanBoard } from './KanbanBoard'
import { CardPreferences } from '@/components/settings/CardPreferences'

export function KanbanView() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end px-4 pt-2">
        <CardPreferences />
      </div>
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>
    </div>
  )
}
