export interface PromptAsset {
  id: string;
  type: string;
  path?: string;
}

export const renderLevelDslUserPrompt = (
  intent: string,
  canvasWidth: number,
  canvasHeight: number,
  assets: PromptAsset[],
): string => {
  const catalog = assets.length > 0
    ? assets.map(asset => `${asset.id} | ${asset.type} | ${asset.path || ''}`).join('\n')
    : '(none)';
  return `TASK\n${intent}\nCANVAS ${canvasWidth} ${canvasHeight}\nASSETS id | type | path\n${catalog}`;
};
