interface OperationLabelSource {
  code?: string | null;
  id?: string | null;
  name?: string | null;
}

export const getOperationLabel = (operation: OperationLabelSource): string => {
  const trimmedCode = operation.code?.trim();
  if (trimmedCode) {
    return trimmedCode;
  }
  const trimmedId = operation.id?.trim();
  if (trimmedId) {
    return trimmedId;
  }
  const trimmedName = operation.name?.trim();
  return trimmedName ?? '';
};
