export async function authorizeBeforeAdminRender<T>(
  authorize: () => Promise<unknown>,
  render: () => T | Promise<T>,
): Promise<T> {
  await authorize();
  return render();
}
