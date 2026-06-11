import path from "path"
import { RGBA, type TerminalColors } from "@opentui/core"
import { Global } from "@opencode-ai/core/global"
import {
  allThemes,
  discoverThemes,
  isTheme,
  resolveTheme,
  terminalMode,
  type Theme,
  type ThemeJson,
} from "@opencode-ai/tui/context/theme"
import { TuiConfig } from "@/config/tui"
import { Style as fallbackStyle } from "./ui"

export type CliStyle = typeof fallbackStyle

const reset = "\x1b[0m"
const bold = "\x1b[1m"

function colorEnabled(force?: boolean) {
  if (process.env.NO_COLOR !== undefined) return false
  if (force === true) return true
  return process.stdout.isTTY === true || process.stderr.isTTY === true
}

function fg(color: RGBA) {
  if (color.intent === "indexed") return `\x1b[38;5;${color.slot}m`
  const [r, g, b] = color.toInts()
  return `\x1b[38;2;${r};${g};${b}m`
}

function tone(color: RGBA, options?: { bold?: boolean }) {
  return fg(color) + (options?.bold ? bold : "")
}

function emptyStyle(): CliStyle {
  const none = ""
  return {
    TEXT_HIGHLIGHT: none,
    TEXT_HIGHLIGHT_BOLD: none,
    TEXT_DIM: none,
    TEXT_DIM_BOLD: none,
    TEXT_NORMAL: none,
    TEXT_NORMAL_BOLD: none,
    TEXT_WARNING: none,
    TEXT_WARNING_BOLD: none,
    TEXT_DANGER: none,
    TEXT_DANGER_BOLD: none,
    TEXT_SUCCESS: none,
    TEXT_SUCCESS_BOLD: none,
    TEXT_INFO: none,
    TEXT_INFO_BOLD: none,
  }
}

function styleFromTheme(theme: Theme): CliStyle {
  return {
    TEXT_HIGHLIGHT: tone(theme.primary),
    TEXT_HIGHLIGHT_BOLD: tone(theme.primary, { bold: true }),
    TEXT_DIM: tone(theme.textMuted),
    TEXT_DIM_BOLD: tone(theme.textMuted, { bold: true }),
    TEXT_NORMAL: reset,
    TEXT_NORMAL_BOLD: bold,
    TEXT_WARNING: tone(theme.warning),
    TEXT_WARNING_BOLD: tone(theme.warning, { bold: true }),
    TEXT_DANGER: tone(theme.error),
    TEXT_DANGER_BOLD: tone(theme.error, { bold: true }),
    TEXT_SUCCESS: tone(theme.success),
    TEXT_SUCCESS_BOLD: tone(theme.success, { bold: true }),
    TEXT_INFO: tone(theme.info),
    TEXT_INFO_BOLD: tone(theme.info, { bold: true }),
  }
}

function themeDirectories(directory: string) {
  const directories = [Global.Path.config]
  for (let current = directory; ; current = path.dirname(current)) {
    directories.push(path.join(current, ".opencode"))
    if (path.dirname(current) === current) break
  }
  return directories
}

function ansiHex(index: number) {
  const colors = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ]
  return colors[index] ?? "#000000"
}

function terminalColorsFromEnv(): TerminalColors | undefined {
  const value = process.env.COLORFGBG
  if (!value) return
  const parts = value.split(";")
  const fg = Number(parts[0])
  const bg = Number(parts[1])
  if (!Number.isFinite(bg)) return
  const palette = Array.from({ length: 16 }, (_, index) => ansiHex(index))
  return {
    palette,
    defaultForeground: Number.isFinite(fg) ? ansiHex(fg) : palette[7]!,
    defaultBackground: ansiHex(bg),
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightForeground: null,
    highlightBackground: null,
  }
}

function resolveMode() {
  const colors = terminalColorsFromEnv()
  if (colors) return terminalMode(colors) ?? "dark"
  return "dark"
}

function pickTheme(name: string | undefined, themes: ReturnType<typeof allThemes>) {
  if (name && themes[name]) return themes[name]
  return themes.opencode
}

export async function resolveCliStyle(input?: { directory?: string; force?: boolean }): Promise<CliStyle> {
  if (!colorEnabled(input?.force)) return emptyStyle()

  try {
    const directory = input?.directory ?? process.cwd()
    const config = await TuiConfig.get()
    const discovered = await discoverThemes(themeDirectories(directory))
    const custom = Object.fromEntries(
      Object.entries(discovered).filter((entry): entry is [string, ThemeJson] => isTheme(entry[1])),
    )
    const themes = { ...allThemes(), ...custom }
    const active = config.theme === "system" && !themes.system ? "opencode" : (config.theme ?? "opencode")
    const json = pickTheme(active, themes)
    return styleFromTheme(resolveTheme(json, resolveMode()))
  } catch {
    return fallbackStyle
  }
}
