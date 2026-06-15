import type { DialogContext } from "./ui/dialog"
import type { DialogConfirmResult } from "./ui/dialog-confirm"

export async function showDialogProviderList(dialog: DialogContext) {
  const { DialogProvider } = await import("./component/dialog-provider")
  dialog.replace(() => <DialogProvider />)
}

export async function showCommandPalette(dialog: DialogContext) {
  const { CommandPaletteDialog } = await import("./component/command-palette")
  dialog.replace(() => <CommandPaletteDialog />)
}

export async function showDialogSessionList(dialog: DialogContext) {
  const { DialogSessionList } = await import("./component/dialog-session-list")
  dialog.replace(() => <DialogSessionList />)
}

export async function showDialogModel(dialog: DialogContext) {
  const { DialogModel } = await import("./component/dialog-model")
  dialog.replace(() => <DialogModel />)
}

export async function showDialogAgent(dialog: DialogContext) {
  const { DialogAgent } = await import("./component/dialog-agent")
  dialog.replace(() => <DialogAgent />)
}

export async function showDialogMcp(dialog: DialogContext) {
  const { DialogMcp } = await import("./component/dialog-mcp")
  dialog.replace(() => <DialogMcp />)
}

export async function showDialogVariant(dialog: DialogContext) {
  const { DialogVariant } = await import("./component/dialog-variant")
  dialog.replace(() => <DialogVariant />)
}

export async function showDialogWorkspaceList(dialog: DialogContext) {
  const { DialogWorkspaceList } = await import("./component/dialog-workspace-list")
  dialog.replace(() => <DialogWorkspaceList />)
}

export async function showDialogConsoleOrg(dialog: DialogContext) {
  const { DialogConsoleOrg } = await import("./component/dialog-console-org")
  dialog.replace(() => <DialogConsoleOrg />)
}

export async function showDialogStatus(dialog: DialogContext) {
  const { DialogStatus } = await import("./component/dialog-status")
  dialog.replace(() => <DialogStatus />)
}

export async function showDialogThemeList(dialog: DialogContext) {
  const { DialogThemeList } = await import("./component/dialog-theme-list")
  dialog.replace(() => <DialogThemeList />)
}

export async function showDialogHelp(dialog: DialogContext) {
  const { DialogHelp } = await import("./ui/dialog-help")
  dialog.replace(() => <DialogHelp />)
}

export async function showDialogConfirm(
  dialog: DialogContext,
  title: string,
  message: string,
  label?: string,
): Promise<DialogConfirmResult> {
  const { DialogConfirm } = await import("./ui/dialog-confirm")
  return DialogConfirm.show(dialog, title, message, label)
}

export async function showDialogAlert(dialog: DialogContext, title: string, message: string) {
  const { DialogAlert } = await import("./ui/dialog-alert")
  return DialogAlert.show(dialog, title, message)
}
