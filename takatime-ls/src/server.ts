import { createConnection, TextDocumentSyncKind } from "vscode-languageserver/node"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { flushHeartbeat, startHeartbeats, trackActivity } from "@/lib/internal/heartbeat"
import { ensureReady, watchConfig } from "@/lib/internal/setup"

// connection
const connection = createConnection()
let roots: string[] = []

// initialize
connection.onInitialize((params) => {
  // workspace roots, falling back to root uri
  // rootUri is deprecated, but some clients may be outdated
  const folders = params.workspaceFolders ?? (params.rootUri ? [{ uri: params.rootUri }] : [])
  roots = folders.map((folder) => fileURLToPath(folder.uri))

  // return capabilities
  return {
    capabilities: {
      // incremental keeps payloads small, content is never read
      textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: true },
    },
  }
})

// ensure the server is ready for payloads
// and start heartbeat manager
connection.onInitialized(() => {
  ensureReady(connection)
  watchConfig(connection)
  startHeartbeats(connection)
})

/**
 * filters unwanted payloads and forwards to heartbeat manager
 *
 * @param uri document uri
 */
const onActivity = (uri: string) => {
  // validate uri
  if (!uri.startsWith("file:")) return

  // set & validate file
  const file = fileURLToPath(uri)
  if (file.includes(`${path.sep}.git${path.sep}`)) return

  // deepest root containing the file
  const root = roots
    .filter((root) => file === root || file.startsWith(root + path.sep))
    .sort((a, b) => b.length - a.length)[0]

  trackActivity(connection, file, root ? path.basename(root) : "Unknown")
}

// upload what's left before zed stops the server
connection.onShutdown(() => flushHeartbeat(connection, true))

// listen to document changes and saves
connection.onDidChangeTextDocument((event) => {
  if (event.contentChanges.length) onActivity(event.textDocument.uri)
})
connection.onDidSaveTextDocument((event) => onActivity(event.textDocument.uri))
connection.listen()
