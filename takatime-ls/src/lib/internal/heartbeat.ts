import { spawn } from "node:child_process"
import type { Connection } from "vscode-languageserver/node"
import { binPath } from "@/lib/internal/binaries"
import { session } from "@/lib/internal/setup"

/**
 * gaps longer than this count as idle (2 minutes)
 */
const IDLE_MS = 120_000

/**
 * background upload interval (1 minute)
 */
const FLUSH_MS = 60_000

/**
 * smallest upload worth spawning for, in seconds
 */
const MIN_SECONDS = 2

// last activity timestamp
let lastActivity = 0

// tracked seconds not yet uploaded
let pending = 0

// file the pending time belongs to
let current: { file: string; project: string } | null = null

/**
 * uploads pending time through `taka-upload`
 *
 * time from failed uploads goes back to pending
 *
 * @param connection lsp connection, used for logging
 * @param force upload anything pending, ignoring the minimum
 */
export const flushHeartbeat = (connection: Connection, force = false) => {
  // not configured, drop time instead of piling it up
  if (!session.ready) {
    pending = 0
    return
  }

  // whole seconds only, keeping the remainder
  const seconds = Math.floor(pending)
  if (!current || seconds < (force ? 1 : MIN_SECONDS)) return
  pending -= seconds

  // put time back on failure, once
  let settled = false
  const settle = (failed: boolean) => {
    if (settled) return
    settled = true
    if (failed) pending += seconds
  }

  const child = spawn(
    binPath("taka-upload"),
    [
      "-file",
      current.file,
      "-project",
      current.project,
      "-uri",
      session.uri,
      "-duration",
      String(seconds),
      "-editor",
      "Zed",
    ],
    { detached: process.platform !== "win32", stdio: "ignore", windowsHide: true }
  )

  // spawn errors are async, will crash node if unhandled
  child.on("error", (error) => {
    connection.console.error(`taka-upload failed: ${error.message}`)
    settle(true)
  })

  // non-zero exit means mongo rejected or never got it
  child.on("exit", (code) => {
    if (code !== 0) connection.console.error(`taka-upload exited with code ${code}`)
    settle(code !== 0)
  })

  child.unref()
}

/**
 * adds time since the last activity, skipping idle gaps
 *
 * @param connection lsp connection
 * @param file absolute file path
 * @param project project name
 */
export const trackActivity = (connection: Connection, file: string, project: string) => {
  const now = Date.now()
  const gap = now - lastActivity
  lastActivity = now

  // still active, count the gap
  if (gap < IDLE_MS) pending += gap / 1000

  // switched files, upload time for the previous one
  if (current && current.file !== file) flushHeartbeat(connection)
  current = { file, project }
}

/**
 * uploads pending time in the background
 *
 * @param connection lsp connection
 */
export const startHeartbeats = (connection: Connection) => {
  setInterval(() => flushHeartbeat(connection), FLUSH_MS).unref()
}
