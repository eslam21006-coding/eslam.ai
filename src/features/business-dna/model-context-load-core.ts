export type OptionalContextQueryResult<Row> = {
  data: Row | null;
  error: unknown | null;
};

type OptionalContextLoadDependencies<Row> = {
  queryOwner(userId: string): Promise<OptionalContextQueryResult<Row>>;
  buildContext(row: Row | null): string | null;
  reportQueryError(error: unknown): void;
  reportFailure(error: unknown): void;
};

export async function loadOptionalOwnerContext<Row>(
  userId: string,
  dependencies: OptionalContextLoadDependencies<Row>,
) {
  try {
    const { data, error } = await dependencies.queryOwner(userId);
    if (error) {
      dependencies.reportQueryError(error);
      return null;
    }

    return dependencies.buildContext(data);
  } catch (error) {
    dependencies.reportFailure(error);
    return null;
  }
}
