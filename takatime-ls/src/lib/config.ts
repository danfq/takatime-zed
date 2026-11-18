import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import binaryVersion from "@/lib/internal/binary-version.json"

/**
 * takatime binary version
 *
 * bumped by the update-binaries workflow
 */
export const BINARY_VERSION: string = binaryVersion.version

// config & bin
export const CONFIG_PATH = path.join(os.homedir(), ".takatime.json")
export const BIN_DIR = path.join(os.homedir(), ".takatime", "bin")

// config interface
export interface TakaConfig {
  MONGO_URI: string
  VERSION: string
  [key: string]: unknown
}

/**
 * reads the config from disk, creating a default one when missing
 *
 * @throws when the file exists but is not valid
 * @returns {TakaConfig} config
 */
export const readConfig = (): TakaConfig => {
  // default config
  const DEFAULT_CONFIG: TakaConfig = { MONGO_URI: "", VERSION: BINARY_VERSION }

  // config missing, create default
  if (!fs.existsSync(CONFIG_PATH)) {
    writeConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }

  // merge with defaults, keeping unknown keys
  return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) }
}

/**
 * writes config to disk, keeping keys other plugins may have added
 *
 * @param config full config object
 */
export const writeConfig = (config: TakaConfig) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 4))
}

/**
 * compares two vX.Y.Z versions
 *
 * @param verA first version
 * @param verB second version
 *
 * @returns {number} negative when verA < verB, 0 when equal, positive when verA > verB
 */
export const compareVersions = (verA: string, verB: string): number => {
  // parse version
  const parse = (version: string) =>
    version
      .replace(/^v/, "")
      .split(".")
      .map((number) => parseInt(number, 10) || 0)

  // parsed versions
  const [a, b] = [parse(verA), parse(verB)]

  // compare versions
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff
  }

  // return result
  return 0
}

/**
 * checks uri against local or hosted mongo connection string
 *
 * @param uri connection string
 *
 * @returns {boolean} whether the connection string is valid
 */
export const isValidMongoUri = (uri: string): boolean => /^mongodb(\+srv)?:\/\/.+/.test(uri)
