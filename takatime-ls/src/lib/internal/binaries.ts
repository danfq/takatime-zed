import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { BIN_DIR, BINARY_VERSION } from "@/lib/config"

// takatime binaries
const BINARIES: string[] = ["taka-upload", "taka-dashboard"] as const
export type Binary = (typeof BINARIES)[number]

/**
 * binary extension, based on current platform
 */
const EXT = process.platform === "win32" ? ".exe" : ""

/**
 * platforms with upstream release builds
 *
 * windows arm64 runs the amd64 build through emulation
 */
const TARGETS: Record<string, string> = {
  "linux-x64": "linux-amd64",
  "darwin-x64": "darwin-amd64",
  "darwin-arm64": "darwin-arm64",
  "win32-x64": "windows-amd64",
  "win32-arm64": "windows-amd64",
}

/**
 * local path for a pinned binary, shared with other takatime plugins
 *
 * @param name binary base name
 *
 * @returns {string} absolute path
 */
export const binPath = (name: Binary): string => path.join(BIN_DIR, `${name}-${BINARY_VERSION}${EXT}`)

/**
 * release asset name for current platform
 *
 * @param name binary base name
 *
 * @throws on unsupported platforms
 * @returns {string} asset file name
 */
const releaseAsset = (name: Binary): string => {
  const platform = `${process.platform}-${process.arch}`
  const target = TARGETS[platform]

  // no upstream build
  if (!target) throw new Error(`Unsupported platform (${platform})`)

  return `${name}-${target}${EXT}`
}

/**
 * binaries not yet downloaded
 *
 * @returns {Binary[]} missing binaries
 */
export const missingBinaries = (): Binary[] => BINARIES.filter((name) => !fs.existsSync(binPath(name)))

/**
 * download binary through a temp file, so a failed download
 * never leaves a broken binary
 *
 * @param name binary base name
 *
 * @throws on unsupported platforms or failed downloads
 */
export const downloadBinary = async (name: Binary) => {
  // upstream release
  const url = `https://github.com/Rtarun3606k/TakaTime/releases/download/${BINARY_VERSION}/${releaseAsset(name)}`

  // destination file
  const dest = binPath(name)
  const tmp = `${dest}.${process.pid}.tmp`

  // create bin dir if non-existent
  await fsp.mkdir(BIN_DIR, { recursive: true })

  // download binary from upstream
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) throw Error(`Download failed for ${name} (HTTP ${response.status})`)

    // success, write to temp file
    await fsp.writeFile(tmp, Buffer.from(await response.arrayBuffer()))

    // set permissions if unix-based platform
    if (process.platform !== "win32") await fsp.chmod(tmp, 0o755)

    // rename temp file
    await fsp.rename(tmp, dest)
  } catch (error) {
    // failed, remove temp file
    await fsp.rm(tmp, { force: true })
    throw error
  }
}
