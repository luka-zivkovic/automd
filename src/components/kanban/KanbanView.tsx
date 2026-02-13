import { KanbanBoard } from './KanbanBoard'
import { CardPreferences } from '@/components/settings/CardPreferences'
import { FilterBar } from '@/components/search/FilterBar'

export function KanbanView() {
  return (
    <div className="flex flex-col h-full">
      <FilterBar />
      <div className="flex justify-end px-4 pt-2">
        <CardPreferences />
      </div>
      <div className="flex-1 min-h-0">
        <KanbanBoard />
      </div>
    </div>
  )
}
