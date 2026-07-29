const FINAL_EXTENSION = /\.[^./\\]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;
const DSL_UNSAFE_CHARACTERS = /[\s#"'`={}\[\](),:/\\]+/g;

/** Extract the display name used for a newly imported resource. */
export const resourceNameFromPath = (path: string): string => {
  const fileName = String(path || '').replace(/\\/g, '/').split('/').pop() || '';
  return fileName.replace(FINAL_EXTENSION, '').trim();
};

/**
 * Generate a readable, DSL-safe ID for a newly imported resource.
 * Existing IDs are deliberately left untouched for project compatibility.
 */
export const resourceIdFromPath = (path: string, existingIds: Set<string>): string => {
  const name = resourceNameFromPath(path);
  let base = name
    .replace(CONTROL_CHARACTERS, '')
    .replace(DSL_UNSAFE_CHARACTERS, '_')
    .replace(/^_+|_+$/g, '');

  if (!base) base = 'resource';
  if (!existingIds.has(base)) return base;

  let duplicateNumber = 2;
  while (existingIds.has(`${base}_${duplicateNumber}`)) duplicateNumber += 1;
  return `${base}_${duplicateNumber}`;
};
