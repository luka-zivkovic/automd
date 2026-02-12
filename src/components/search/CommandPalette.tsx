import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  Search,
  FileText,
  CheckSquare,
  Columns3,
  Code2,
  ClipboardList,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
} from 'lucide-react'
import { useUiStore } from '@/store/ui-store'
import { useDocumentStore } from '@/store/document-store'
import { useFilesStore } from '@/store/files-store'
import { useGlobalSearch } from '@/hooks/useGlobalSearch'

interface PaletteItem {
  id: string
  type: 'task' | 'file' | 'cross-file-task' | 'action'
  label: string
  description?: string
  icon: React.ReactNode
  action: () => void
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const setActiveView = useUiStore((s) => s.setActiveView)
  const setSelectedTaskId = useUiStore((s) => s.setSelectedTaskId)
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen)

  const tasks = useDocumentStore((s) => s.tasks)
  const files = useFilesStore((s) => s.files)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const createFile = useFilesStore((s) => s.createFile)

  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const crossFileResults = useGlobalSearch(query)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setSelectedIndex(0)
  }, [setOpen])

  // Build flat list of results
  const items = useMemo(() => {
    const q = query.toLowerCase().trim()
    const result: PaletteItem[] = []

    // --- Tasks from current file ---
    const matchingTasks = q
      ? tasks.filter((t) => t.displayContent.toLowerCase().includes(q))
      : []

    for (const task of matchingTasks.slice(0, 10)) {
      result.push({
        id: `task-${task.id}`,
        type: 'task',
        label: task.displayContent,
        description: task.column,
        icon: <CheckSquare className="size-4 text-amber-600 dark:text-amber-400" />,
        action: () => {
          setSelectedTaskId(task.id)
          setActiveView('kanban')
          close()
        },
      })
    }

    // --- Cross-file task results ---
    for (const r of crossFileResults.slice(0, 8)) {
      result.push({
        id: `cross-${r.taskId}`,
        type: 'cross-file-task',
        label: r.taskContent,
        description: r.fileName,
        icon: <FileText className="size-4 text-slate-500 dark:text-slate-400" />,
        action: () => {
          setActiveFile(r.fileId)
          close()
        },
      })
    }

    // --- File results ---
    const matchingFiles = q
      ? files.filter((f) => f.name.toLowerCase().includes(q))
      : files

    for (const file of matchingFiles.slice(0, 6)) {
      result.push({
        id: `file-${file.id}`,
        type: 'file',
        label: file.name,
        icon: <FileText className="size-4 text-blue-500 dark:text-blue-400" />,
        action: () => {
          setActiveFile(file.id)
          close()
        },
      })
    }

    // --- Quick actions ---
    const actions: PaletteItem[] = [
      {
        id: 'action-dashboard',
        type: 'action',
        label: 'Switch to Dashboard',
        icon: <LayoutDashboard className="size-4 text-slate-500 dark:text-slate-400" />,
        action: () => {
          setActiveView('dashboard')
          close()
        },
      },
      {
        id: 'action-editor',
        type: 'action',
        label: 'Switch to Editor',
        icon: <Code2 className="size-4 text-emerald-500 dark:text-emerald-400" />,
        action: () => {
          setActiveView('editor')
          close()
        },
      },
      {
        id: 'action-checklist',
        type: 'action',
        label: 'Switch to Checklist',
        icon: <ClipboardList className="size-4 text-violet-500 dark:text-violet-400" />,
        action: () => {
          setActiveView('checklist')
          close()
        },
      },
      {
        id: 'action-kanban',
        type: 'action',
        label: 'Switch to Kanban',
        icon: <Columns3 className="size-4 text-amber-600 dark:text-amber-400" />,
        action: () => {
          setActiveView('kanban')
          close()
        },
      },
      {
        id: 'action-new-board',
        type: 'action',
        label: 'New Board',
        icon: <Plus className="size-4 text-slate-500 dark:text-slate-400" />,
        action: () => {
          const id = createFile('Untitled Board')
          setActiveFile(id)
          close()
        },
      },
      {
        id: 'action-toggle-sidebar',
        type: 'action',
        label: sidebarOpen ? 'Close Sidebar' : 'Open Sidebar',
        icon: sidebarOpen ? (
          <PanelLeftClose className="size-4 text-slate-500 dark:text-slate-400" />
        ) : (
          <PanelLeftOpen className="size-4 text-slate-500 dark:text-slate-400" />
        ),
        action: () => {
          setSidebarOpen(!sidebarOpen)
          close()
        },
      },
    ]

    // Filter actions by query if searching
    const filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q))
      : actions

    result.push(...filteredActions)

    return result
  }, [
    query,
    tasks,
    crossFileResults,
    files,
    sidebarOpen,
    setSelectedTaskId,
    setActiveView,
    setActiveFile,
    setSidebarOpen,
    createFile,
    close,
  ])

  // Clamp selectedIndex when items change
  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, items.length - 1)))
  }, [items.length])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Small delay to ensure DOM is ready
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    if (el) {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Keyboard navigation
  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, items.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (items[selectedIndex]) {
          items[selectedIndex].action()
        }
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
    }
  }

  if (!open) return null

  // Group items by type for section headers
  const sections: { type: string; title: string; items: (PaletteItem & { globalIndex: number })[] }[] = []
  let globalIndex = 0

  const taskItems = items.filter((i) => i.type === 'task')
  if (taskItems.length > 0) {
    sections.push({
      type: 'task',
      title: 'Tasks',
      items: taskItems.map((item) => ({ ...item, globalIndex: globalIndex++ })),
    })
  }

  const crossFileItems = items.filter((i) => i.type === 'cross-file-task')
  if (crossFileItems.length > 0) {
    sections.push({
      type: 'cross-file-task',
      title: 'Other Files',
      items: crossFileItems.map((item) => ({ ...item, globalIndex: globalIndex++ })),
    })
  }

  const fileItems = items.filter((i) => i.type === 'file')
  if (fileItems.length > 0) {
    sections.push({
      type: 'file',
      title: 'Files',
      items: fileItems.map((item) => ({ ...item, globalIndex: globalIndex++ })),
    })
  }

  const actionItems = items.filter((i) => i.type === 'action')
  if (actionItems.length > 0) {
    sections.push({
      type: 'action',
      title: 'Actions',
      items: actionItems.map((item) => ({ ...item, globalIndex: globalIndex++ })),
    })
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        className="w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Search tasks, files, or actions..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-1.5">
          {sections.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {sections.map((section) => (
            <div key={section.type}>
              <div className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {section.title}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.id}
                  data-index={item.globalIndex}
                  onClick={item.action}
                  className={`flex items-center gap-3 w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                    item.globalIndex === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/50'
                  }`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="truncate flex-1">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-muted-foreground truncate shrink-0 max-w-[120px]">
                      {item.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
              &uarr;&darr;
            </kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
              &crarr;
            </kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">
              esc
            </kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}
