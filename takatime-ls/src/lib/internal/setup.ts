import fs from "node:fs"
import type { Connection } from "vscode-languageserver/node"
import {
  BINARY_VERSION,
  CONFIG_PATH,
  compareVersions,
  isValidMongoUri,
  readConfig,
  writeConfig,
  type TakaConfig,
} from "@/lib/config"
import { downloadBinary, missingBinaries } from "@/lib/internal/binaries"

// retry delay for failed installs
const RETRY_MS = 5 * 60_000

/**
 * current session state, read by the heartbeat manager
 */
export const session = { uri: "", ready: false }

// in-flight setup, shared by concurrent callers
let running: Promise<void> | null = null

// install error already shown or not
let notified = false

// pending installation retry
let retry: NodeJS.Timeout | undefined

/**
 * error message from an unknown thrown value
 *
 * @param error thrown value
 *
 * @returns {string} message
 */
const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * loads config and installs missing binaries, marking the session ready on success
 *
 * @param connection lsp connection
 */
const setup = async (connection: Connection) => {
  // clear status & retry state
  session.ready = false
  clearTimeout(retry)

  // load config
  let config: TakaConfig
  try {
    config = readConfig()
  } catch (error) {
    connection.window.showErrorMessage(`Couldn't read ${CONFIG_PATH} (${errorMessage(error)})`)
    return
  }

  // bump version so other plugins see the binary in use
  if (compareVersions(config.VERSION, BINARY_VERSION) < 0) writeConfig({ ...config, VERSION: BINARY_VERSION })

  // validate uri
  const uri = config.MONGO_URI.trim()
  if (!uri) {
    connection.window.showWarningMessage(`Set MONGO_URI in ${CONFIG_PATH} to start tracking.`)
    return
  }
  if (!isValidMongoUri(uri)) {
    connection.window.showErrorMessage(
      `MONGO_URI in ${CONFIG_PATH} is not a valid MongoDB connection string.`
    )
    return
  }

  // install missing binaries
  const missing = missingBinaries()
  if (missing.length) {
    const progress = await connection.window.createWorkDoneProgress()
    progress.begin(`Installing TakaTime ${BINARY_VERSION}`)

    try {
      for (const [index, name] of missing.entries()) {
        progress.report((index / missing.length) * 100, name)
        await downloadBinary(name)
      }
    } catch (error) {
      // show once, retry quietly
      if (!notified) {
        connection.window.showErrorMessage(
          `Couldn't install binaries (${errorMessage(error)}). Retrying in the background.`
        )

        notified = true
      }

      connection.console.error(`installation failed: ${errorMessage(error)}`)
      retry = setTimeout(() => void ensureReady(connection), RETRY_MS).unref()
      return
    } finally {
      progress.done()
    }
  }

  // update session
  session.uri = uri
  session.ready = true
  connection.console.info(`takatime active (${BINARY_VERSION})`)
}

/**
 * verifies if a provided connection is ready for payloads
 *
 * @param connection connection to verify
 */
export const ensureReady = (connection: Connection): Promise<void> => {
  running ??= setup(connection).finally(() => (running = null))
  return running
}

/**
 * re-runs setup whenever the config file changes
 *
 * @param connection lsp connection
 */
export const watchConfig = (connection: Connection) => {
  fs.watchFile(CONFIG_PATH, { interval: 5000, persistent: false }, () => void ensureReady(connection))
}
