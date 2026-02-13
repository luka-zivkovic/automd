import { useState, useCallback } from 'react'
import { useFilesStore } from '@/store/files-store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Plus } from 'lucide-react'
import { TemplatePicker } from './TemplatePicker'
import type { BoardTemplate } from '@/lib/templates'

export function CreateFileButton() {
  const createFile = useFilesStore((s) => s.createFile)
  const setActiveFile = useFilesStore((s) => s.setActiveFile)
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleTogglePicker = useCallback(() => {
    setPickerOpen((prev) => !prev)
  }, [])

  const handleClosePicker = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const handleSelectTemplate = useCallback(
    (template: BoardTemplate) => {
      const id = createFile(template.name, template.markdown)
      setActiveFile(id)
      setPickerOpen(false)
    },
    [createFile, setActiveFile]
  )

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleTogglePicker}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">New Board</TooltipContent>
      </Tooltip>

      {pickerOpen && (
        <TemplatePicker
          onSelect={handleSelectTemplate}
          onClose={handleClosePicker}
        />
      )}
    </div>
  )
}
