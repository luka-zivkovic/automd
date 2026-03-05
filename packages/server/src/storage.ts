import fs from 'node:fs'
import path from 'node:path'
import type { BoardFile, ItemType, Project } from '@automd/shared'
import { DEFAULT_MARKDOWN } from '@automd/shared'
import { isWithinDirectory } from './validation.js'
import { getAutomdDir } from './config.js'
import { syncFileToS3, deleteFileFromS3 } from './s3-sync.js'
function getBoardsDir() {
  return path.join(getAutomdDir(), 'boards')
}
function getManifestPath() {
  return path.join(getAutomdDir(), 'manifest.json')
}

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'StorageError'
  }
}

interface Manifest {
  files: Array<{
    id: string
    name: string
    filename: string
    projectId: string | null
    itemType: ItemType
    createdAt: number
    updatedAt: number
  }>
  projects: Project[]
}

function ensureDirs() {
  const automdDir = getAutomdDir()
  const boardsDir = getBoardsDir()
  if (!fs.existsSync(automdDir)) fs.mkdirSync(automdDir, { recursive: true })
  if (!fs.existsSync(boardsDir)) fs.mkdirSync(boardsDir, { recursive: true })
}

function readManifest(): Manifest {
  ensureDirs()
  const manifestPath = getManifestPath()
  if (!fs.existsSync(manifestPath)) {
    return { files: [], projects: [] }
  }
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed.files)) parsed.files = []
    if (!Array.isArray(parsed.projects)) parsed.projects = []
    // Migrate legacy entries missing itemType
    for (const f of parsed.files) {
      if (!f.itemType) f.itemType = 'board'
    }
    return parsed as Manifest
  } catch (err) {
    console.error('[storage] Failed to read manifest.json, resetting:', err)
    try {
      const backupPath = manifestPath + `.corrupt.${Date.now()}`
      fs.renameSync(manifestPath, backupPath)
      console.error(`[storage] Corrupted manifest backed up to: ${backupPath}`)
    } catch {
      /* ignore backup failure */
    }
    return { files: [], projects: [] }
  }
}

function writeManifest(manifest: Manifest) {
  ensureDirs()
  const manifestPath = getManifestPath()
  const tmpPath = manifestPath + '.tmp'
  try {
    const json = JSON.stringify(manifest, null, 2)
    fs.writeFileSync(tmpPath, json, 'utf-8')
    fs.renameSync(tmpPath, manifestPath)
    syncFileToS3(manifestPath, json).catch(() => {})
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      /* ignore */
    }
    throw new StorageError('Failed to save manifest', err)
  }
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

/** Resolve a board filename and verify it's within the boards directory */
function safeBoardPath(filename: string): string {
  const boardsDir = getBoardsDir()
  const mdPath = path.join(boardsDir, filename)
  if (!isWithinDirectory(mdPath, boardsDir)) {
    throw new StorageError(`Invalid board filename: ${filename}`)
  }
  return mdPath
}

// ─── File Operations ─────────────────────────────────────────────────

export function listFiles(): BoardFile[] {
  try {
    const manifest = readManifest()
    return manifest.files.map((f) => {
      const mdPath = safeBoardPath(f.filename)
      let markdown = ''
      try {
        if (fs.existsSync(mdPath)) {
          markdown = fs.readFileSync(mdPath, 'utf-8')
        }
      } catch (err) {
        console.error(`[storage] Failed to read board file ${f.filename}:`, err)
      }
      return {
        id: f.id,
        name: f.name,
        markdown,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        projectId: f.projectId,
        itemType: f.itemType,
      }
    })
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError('Failed to list files', err)
  }
}

export function getFile(id: string): BoardFile | null {
  try {
    const manifest = readManifest()
    const entry = manifest.files.find((f) => f.id === id)
    if (!entry) return null

    const mdPath = safeBoardPath(entry.filename)
    let markdown = ''
    try {
      if (fs.existsSync(mdPath)) {
        markdown = fs.readFileSync(mdPath, 'utf-8')
      }
    } catch (err) {
      console.error(`[storage] Failed to read board file ${entry.filename}:`, err)
    }

    return {
      id: entry.id,
      name: entry.name,
      markdown,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      projectId: entry.projectId,
      itemType: entry.itemType,
    }
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to get file ${id}`, err)
  }
}

export function createFile(
  id: string,
  name: string,
  markdown?: string,
  projectId?: string | null,
  itemType?: ItemType,
): BoardFile {
  try {
    const manifest = readManifest()
    if (manifest.files.some((f) => f.id === id)) {
      throw new StorageError(`File with ID '${id}' already exists`)
    }
    const existingFilenames = manifest.files.map((f) => f.filename)
    const filename = uniqueFilename(name, existingFilenames)
    const now = Date.now()
    const content = markdown ?? DEFAULT_MARKDOWN
    const resolvedItemType = itemType ?? 'board'

    const mdPath = safeBoardPath(filename)
    ensureDirs()
    fs.writeFileSync(mdPath, content, 'utf-8')
    syncFileToS3(mdPath, content).catch(() => {})

    const entry = {
      id,
      name,
      filename,
      projectId: projectId ?? null,
      itemType: resolvedItemType,
      createdAt: now,
      updatedAt: now,
    }
    manifest.files.push(entry)

    // Link file to project
    if (projectId) {
      const project = manifest.projects.find((p) => p.id === projectId)
      if (project && !project.fileIds.includes(id)) {
        project.fileIds.push(id)
      }
    }

    writeManifest(manifest)

    return {
      id,
      name,
      markdown: content,
      createdAt: now,
      updatedAt: now,
      projectId: projectId ?? null,
      itemType: resolvedItemType,
    }
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to create file ${name}`, err)
  }
}

export function updateFileMarkdown(id: string, markdown: string): BoardFile | null {
  try {
    const manifest = readManifest()
    const entry = manifest.files.find((f) => f.id === id)
    if (!entry) return null

    entry.updatedAt = Date.now()
    writeManifest(manifest)

    const mdPath = safeBoardPath(entry.filename)
    fs.writeFileSync(mdPath, markdown, 'utf-8')
    syncFileToS3(mdPath, markdown).catch(() => {})

    return {
      id: entry.id,
      name: entry.name,
      markdown,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      projectId: entry.projectId,
      itemType: entry.itemType,
    }
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to update file ${id}`, err)
  }
}

export function renameFile(id: string, name: string): BoardFile | null {
  try {
    const manifest = readManifest()
    const entry = manifest.files.find((f) => f.id === id)
    if (!entry) return null

    entry.name = name
    entry.updatedAt = Date.now()
    writeManifest(manifest)

    return getFile(id)
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to rename file ${id}`, err)
  }
}

export function deleteFile(id: string): boolean {
  try {
    const manifest = readManifest()
    const idx = manifest.files.findIndex((f) => f.id === id)
    if (idx === -1) return false

    const entry = manifest.files[idx]
    const mdPath = safeBoardPath(entry.filename)
    try {
      if (fs.existsSync(mdPath)) {
        fs.unlinkSync(mdPath)
        deleteFileFromS3(mdPath).catch(() => {})
      }
    } catch (err) {
      console.error(`[storage] Failed to delete board file ${entry.filename}:`, err)
    }

    manifest.files.splice(idx, 1)

    // Remove from any projects
    for (const project of manifest.projects) {
      project.fileIds = project.fileIds.filter((fid) => fid !== id)
    }

    writeManifest(manifest)
    return true
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to delete file ${id}`, err)
  }
}

// ─── Project Operations ──────────────────────────────────────────────

export function listProjects(): Project[] {
  try {
    return readManifest().projects
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError('Failed to list projects', err)
  }
}

export function createProject(
  id: string,
  name: string,
  color: string,
): Project {
  try {
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
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to create project ${name}`, err)
  }
}

export function updateProject(
  id: string,
  updates: Partial<Pick<Project, 'name' | 'color' | 'fileIds'>>,
): Project | null {
  try {
    const manifest = readManifest()
    const project = manifest.projects.find((p) => p.id === id)
    if (!project) return null

    if (updates.name !== undefined) project.name = updates.name
    if (updates.color !== undefined) project.color = updates.color
    if (updates.fileIds !== undefined) project.fileIds = updates.fileIds

    writeManifest(manifest)
    return project
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to update project ${id}`, err)
  }
}

export function deleteProject(id: string): boolean {
  try {
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
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to delete project ${id}`, err)
  }
}

export function moveFileToProject(
  fileId: string,
  projectId: string | null,
): boolean {
  try {
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
  } catch (err) {
    if (err instanceof StorageError) throw err
    throw new StorageError(`Failed to move file ${fileId} to project ${projectId}`, err)
  }
}

export function getStoragePath(): string {
  return getAutomdDir()
}

export function getStorageSummary(): { items: number; projects: number } {
  const manifest = readManifest()
  return { items: manifest.files.length, projects: manifest.projects.length }
}
