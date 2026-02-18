const COLUMNS = [
  { cards: [{ w: '75%', meta: '45%' }, { w: '60%', meta: '55%' }, { w: '85%', meta: '35%' }] },
  { cards: [{ w: '70%', meta: '50%' }, { w: '90%', meta: '40%' }] },
  { cards: [{ w: '65%', meta: '60%' }, { w: '80%', meta: '30%' }] },
]

export function LoadingSkeleton() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Filter bar area — matches FilterBar + CardPreferences layout */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-56 bg-secondary/50 rounded-lg animate-pulse" />
          <div className="h-8 w-20 bg-secondary/35 rounded-lg animate-pulse" style={{ animationDelay: '150ms' }} />
        </div>
      </div>

      {/* Columns — matches KanbanBoard: flex gap-5 p-6 */}
      <div className="flex gap-5 p-6 pt-2 flex-1 min-h-0">
        {COLUMNS.map((col, ci) => (
          <div
            key={ci}
            className="flex flex-col w-[280px] min-w-[280px] bg-card rounded-xl border border-border shadow-sm"
          >
            {/* Column header — matches ColumnHeader spacing */}
            <div className="flex items-center gap-2 px-3.5 py-3">
              <div
                className="h-4 w-20 bg-secondary/60 rounded animate-pulse"
                style={{ animationDelay: `${ci * 120}ms` }}
              />
              <div
                className="h-4 w-6 bg-secondary/35 rounded-full animate-pulse"
                style={{ animationDelay: `${ci * 120 + 60}ms` }}
              />
            </div>

            {/* Cards area — matches KanbanColumn: px-2.5 py-2, cards use mb-1.5 */}
            <div className="flex-1 px-2.5 py-2 space-y-1.5">
              {col.cards.map((card, j) => (
                <div
                  key={j}
                  className="rounded-lg border border-border/60 bg-background p-3 space-y-2 animate-pulse"
                  style={{ animationDelay: `${ci * 140 + j * 100 + 200}ms` }}
                >
                  <div className="h-3.5 bg-secondary/50 rounded" style={{ width: card.w }} />
                  <div className="h-2.5 bg-secondary/30 rounded" style={{ width: card.meta }} />
                </div>
              ))}
            </div>

            {/* Input area placeholder — matches RichTaskInput area: px-3 pb-3 */}
            <div className="px-3 pb-3">
              <div
                className="h-8 bg-secondary/25 rounded-lg animate-pulse"
                style={{ animationDelay: `${ci * 140 + 500}ms` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
