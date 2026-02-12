export const PROJECT_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  blue: 'bg-blue-500',
  violet: 'bg-violet-500',
  pink: 'bg-pink-500',
  slate: 'bg-slate-500',
}

export const PROJECT_COLOR_NAMES = Object.keys(PROJECT_COLORS)

export function getProjectColorClass(color: string): string {
  return PROJECT_COLORS[color] ?? 'bg-slate-500'
}
