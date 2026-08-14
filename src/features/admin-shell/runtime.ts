export type AdminDialogPort = {
  open: boolean;
  showModal: () => void;
  close: () => void;
};

/** Opens the admin mobile navigation dialog when it exists and is currently closed. */
export function openAdminMobileMenu(dialog: AdminDialogPort | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
}

/** Closes the admin mobile navigation dialog when it is currently open. */
export function closeAdminMobileMenu(dialog: AdminDialogPort | null) {
  if (!dialog?.open) return;
  dialog.close();
}

/** Handles the dialog cancel gesture without allowing the browser to leave stale menu state behind. */
export function handleAdminMenuCancel(
  dialog: AdminDialogPort | null,
  preventDefault: () => void,
) {
  preventDefault();
  closeAdminMobileMenu(dialog);
}

/** Returns whether an exact admin navigation destination matches the current pathname. */
export function isAdminNavigationActive(pathname: string, href: string) {
  return pathname === href;
}

/** Returns whether an admin navigation group owns the current pathname. */
export function isAdminNavigationGroupActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
