import { expect, test } from "bun:test"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import type { TerminalColors } from "@opentui/core"
import {
  contrastForeground,
  DEFAULT_THEMES,
  addTheme,
  allThemes,
  generateSystem,
  hasTheme,
  listSelectionBackground,
  resolveTheme,
  selectedForeground,
  terminalMode,
} from "../src/theme"
import { discoverThemes } from "../src/context/theme"
import { tmpdir } from "./fixture/fixture"

test("addTheme writes into module theme store", () => {
  const name = `plugin-theme-${Date.now()}`
  expect(addTheme(name, DEFAULT_THEMES.opencode)).toBe(true)
  expect(allThemes()[name]).toBeDefined()
})

test("addTheme keeps first theme for duplicate names", () => {
  const name = `plugin-theme-keep-${Date.now()}`
  const one = structuredClone(DEFAULT_THEMES.opencode)
  const two = structuredClone(DEFAULT_THEMES.opencode)
  one.theme.primary = "#101010"
  two.theme.primary = "#fefefe"

  expect(addTheme(name, one)).toBe(true)
  expect(addTheme(name, two)).toBe(false)
  expect(allThemes()[name]!.theme.primary).toBe("#101010")
})

test("addTheme ignores entries without a theme object", () => {
  const name = `plugin-theme-invalid-${Date.now()}`
  expect(addTheme(name, { defs: { a: "#ffffff" } })).toBe(false)
  expect(allThemes()[name]).toBeUndefined()
})

test("hasTheme checks theme presence", () => {
  const name = `plugin-theme-has-${Date.now()}`
  expect(hasTheme(name)).toBe(false)
  expect(addTheme(name, DEFAULT_THEMES.opencode)).toBe(true)
  expect(hasTheme(name)).toBe(true)
})

test("resolveTheme rejects circular color refs", () => {
  const item = structuredClone(DEFAULT_THEMES.opencode)
  item.defs = { ...item.defs, one: "two", two: "one" }
  item.theme.primary = "one"
  expect(() => resolveTheme(item, "dark")).toThrow("Circular color reference")
})

function terminalColors(defaultBackground: string | null, palette: Array<string | null> = []): TerminalColors {
  return {
    palette,
    defaultForeground: null,
    defaultBackground,
    cursorColor: null,
    mouseForeground: null,
    mouseBackground: null,
    tekForeground: null,
    tekBackground: null,
    highlightBackground: null,
    highlightForeground: null,
  }
}

test("terminalMode derives mode from refreshed background", () => {
  expect(terminalMode(terminalColors("#fbf1c7"))).toBe("light")
  expect(terminalMode(terminalColors("#1a1b26"))).toBe("dark")
})

test("terminalMode does not derive mode from ANSI slot zero", () => {
  expect(terminalMode(terminalColors(null, ["#000000"]))).toBeUndefined()
})

test("generateSystem uses transparent panel backgrounds", () => {
  const colors = terminalColors("#1a1b26", ["#1a1b26", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6"])
  const theme = generateSystem(colors, "dark")
  const resolved = resolveTheme(theme, "dark")
  expect(resolved.background.a).toBe(0)
  expect(resolved.backgroundPanel.a).toBe(0)
  expect(resolved.backgroundElement.a).toBe(0)
  expect(resolved.backgroundMenu.a).not.toBe(0)
})

test("generateSystem selectedListItemText contrasts with primary", () => {
  const colors = terminalColors("#fbf1c7", ["#fbf1c7", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#7c6f64"])
  const resolved = resolveTheme(generateSystem(colors, "light"), "light")
  expect(resolved.selectedListItemText).toEqual(contrastForeground(resolved.primary))
})

test("selectedForeground honors explicit background", () => {
  const colors = terminalColors("#1a1b26", ["#1a1b26", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6"])
  const resolved = resolveTheme(generateSystem(colors, "dark"), "dark")
  expect(selectedForeground(resolved, resolved.warning)).toEqual(contrastForeground(resolved.warning))
})

test("listSelectionBackground tints menu for transparent themes", () => {
  const colors = terminalColors("#1a1b26", ["#1a1b26", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6"])
  const resolved = resolveTheme(generateSystem(colors, "dark"), "dark")
  const bg = listSelectionBackground(resolved)
  expect(bg).not.toEqual(resolved.primary)
  expect(bg.a).not.toBe(0)
  expect(listSelectionBackground(resolved, resolved.warning)).not.toEqual(resolved.warning)
})

test("custom theme precedence follows directory order", async () => {
  await using tmp = await tmpdir()
  const global = path.join(tmp.path, "global")
  const project = path.join(tmp.path, "project")
  await mkdir(path.join(global, "themes"), { recursive: true })
  await mkdir(path.join(project, "themes"), { recursive: true })
  await writeFile(path.join(global, "themes", "custom.json"), JSON.stringify({ source: "global" }))
  await writeFile(path.join(project, "themes", "custom.json"), JSON.stringify({ source: "project" }))

  await expect(discoverThemes([global, project])).resolves.toEqual({ custom: { source: "project" } })
})
