/** Loads the Pixi chunk and decodes fight textures without pulling Pixi into the classic slot graph. */
export function preloadNocna(): Promise<void> {
  return import("./pixi/fight-stage").then((m) => m.preloadNocna());
}
