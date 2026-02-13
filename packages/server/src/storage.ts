import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { BoardFile, Project } from '@automd/shared'
import { DEFAULT_MARKDOWN } from '@automd/shared'

const AUTOMD_DIR = path.join(os.homedir(), '.automd')
const BOARDS_DIR = path.join(AUTOMD_DIR, 'boards')
const MANIFEST_PATH = path.join(AUTOMD_DIR, 'manifest.json')

interface Manifest {
  files: Array<{
    id: string
    name: string
    filename: string
    projectId: string | null
    createdAt: number
    updatedAt: number
  }>
  projects: Project[]
}

function ensureDirs() {
  if (!fs.existsSync(AUTOMD_DIR)) fs.mkdirSync(AUTOMD_DIR, { recursive: true })
  if (!fs.existsSync(BOARDS_DIR)) fs.mkdirSync(BOARDS_DIR, { recursive: true })
}

function readManifest(): Manifest {
  ensureDirs()
  if (!fs.existsSync(MANIFEST_PATH)) {
    return { files: [], projects: [] }
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
}

function writeManifest(manifest: Manifest) {
  ensureDirs()
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8')
}

function filenameSafe(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
}

function uniqueFilename(name: string, existingFilenames: string[]): string {
  let base = filenameSafe(name)
  let filename = `${base}.md`
  let counter = 1
  while (existingFilenames.includes(filename)) {
    filename = `${base}-${counter++}.md`
  }
  return filename
}

// ─── File Operations ─────────────────────────────────────────────────

export function listFiles(): BoardFile[] {
  const manifest = readManifest()
  return manifest.files.map((f) => {
    const mdPath = path.join(BOARDS_DIR, f.filename)
    const markdown = fs.existsSync(mdPath)
      ? fs.readFileSync(mdPath, 'utf-8')
      : ''
    return {
      id: f.id,
      name: f.name,
      markdown,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      projectId: f.projectId,
    }
  })
}

export function getFile(id: string): BoardFile | null {
  const manifest = readManifest()
  const entry = manifest.files.find((f) => f.id === id)
  if (!entry) return null

  const mdPath = path.join(BOARDS_DIR, entry.filename)
  const markdown = fs.existsSync(mdPath)
    ? fs.readFileSync(mdPath, 'utf-8')
    : ''

  return {
    id: entry.id,
    name: entry.name,
    markdown,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    projectId: entry.projectId,
  }
}

export function createFile(
  id: string,
  name: string,
  markdown?: string,
  projectId?: string | null
): BoardFile {
  const manifest = readManifest()
  const existingFilenames = manifest.files.map((f) => f.filename)
  const filename = uniqueFilename(name, existingFilenames)
  const now = Date.now()
  const content = markdown ?? DEFAULT_MARKDOWN

  ensureDirs()
  fs.writeFileSync(path.join(BOARDS_DIR, filename), content, 'utf-8')

  const entry = {
    id,
    name,
    filename,
    projectId: projectId ?? null,
    createdAt: now,
    updatedAt: now,
  }
  manifest.files.push(entry)
  writeManifest(manifest)

  return {
    id,
    name,
    markdown: content,
    createdAt: now,
    updatedAt: now,
    projectId: projectId ?? null,
  }
}

export function updateFileMarkdown(id: string, markdown: string): BoardFile | null {
  const manifest = readManifest()
  const entry = manifest.files.find((f) => f.id === id)
  if (!entry) return null

  entry.updatedAt = Date.now()
  writeManifest(manifest)

  const mdPath = path.join(BOARDS_DIR, entry.filename)
  fs.writeFileSync(mdPath, markdown, 'utf-8')

  return {
    id: entry.id,
    name: entry.name,
    markdown,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    projectId: entry.projectId,
  }
}

export function renameFile(id: string, name: string): BoardFile | null {
  const manifest = readManifest()
  const entry = manifest.files.find((f) => f.id === id)
  if (!entry) return null

  entry.name = name
  entry.updatedAt = Date.now()
  writeManifest(manifest)

  return getFile(id)
}

export function deleteFile(id: string): boolean {
  const manifest = readManifest()
  const idx = manifest.files.findIndex((f) => f.id === id)
  if (idx === -1) return false

  const entry = manifest.files[idx]
  const mdPath = path.join(BOARDS_DIR, entry.filename)
  if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath)

  manifest.files.splice(idx, 1)

  // Remove from any projects
  for (const project of manifest.projects) {
    project.fileIds = project.fileIds.filter((fid) => fid !== id)
  }

  writeManifest(manifest)
  return true
}

// ─── Project Operations ──────────────────────────────────────────────

export function listProjects(): Project[] {
  return readManifest().projects
}

export function createProject(
  id: string,
  name: string,
  color: string
): Project {
  const manifest = readManifest()
  const project: Project = {
    id,
    name,
    color,
    fileIds: [],
    createdAt: Date.now(),
  }
  manifest.projects.push(project)
  writeManifest(manifest)
  return project
}

export function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'color' | 'fileIds'>>
): Project | null {
  const manifest = readManifest()
  const project = manifest.projects.find((p) => p.id === id)
  if (!project) return null

  if (updates.name !== undefined) project.name = updates.name
  if (updates.color !== undefined) project.color = updates.color
  if (updates.fileIds !== undefined) project.fileIds = updates.fileIds

  writeManifest(manifest)
  return project
}

export function deleteProject(id: string): boolean {
  const manifest = readManifest()
  const idx = manifest.projects.findIndex((p) => p.id === id)
  if (idx === -1) return false

  // Unlink files from this project
  for (const file of manifest.files) {
    if (file.projectId === id) file.projectId = null
  }

  manifest.projects.splice(idx, 1)
  writeManifest(manifest)
  return true
}

export function moveFileToProject(
  fileId: string,
  projectId: string | null
): boolean {
  const manifest = readManifest()
  const file = manifest.files.find((f) => f.id === fileId)
  if (!file) return false

  // Remove from old project's fileIds
  if (file.projectId) {
    const oldProject = manifest.projects.find((p) => p.id === file.projectId)
    if (oldProject) {
      oldProject.fileIds = oldProject.fileIds.filter((fid) => fid !== fileId)
    }
  }

  file.projectId = projectId

  // Add to new project's fileIds
  if (projectId) {
    const newProject = manifest.projects.find((p) => p.id === projectId)
    if (newProject && !newProject.fileIds.includes(fileId)) {
      newProject.fileIds.push(fileId)
    }
  }

  writeManifest(manifest)
  return true
}

export function getStoragePath(): string {
  return AUTOMD_DIR
}
