export type AdminDialogPort = {
  open: boolean;
  showModal: () => void;
  close: () => void;
};

export function openAdminMobileMenu(dialog: AdminDialogPort | null) {
  if (!dialog || dialog.open) return;
  dialog.showModal();
}

export function closeAdminMobileMenu(dialog: AdminDialogPort | null) {
  if (!dialog?.open) return;
  dialog.close();
}

export function handleAdminMenuCancel(
  dialog: AdminDialogPort | null,
  preventDefault: () => void,
) {
  preventDefault();
  closeAdminMobileMenu(dialog);
}

export function isAdminNavigationActive(pathname: string, href: string) {
  return pathname === href;
}
