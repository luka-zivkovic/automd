import { Settings } from 'lucide-react'
import { EmbeddingsSettings } from './EmbeddingsSettings'

export function SettingsView() {
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-3xl mx-auto px-6 py-6 flex flex-col gap-6">
          <EmbeddingsSettings />
        </div>
      </div>
    </div>
  )
}
