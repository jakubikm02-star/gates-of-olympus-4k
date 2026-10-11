declare module "virtual:park-public-assets" {
  /** Built by scripts/park-assets-plugin.mjs from public/ at build time. */
  const assets: {
    /** "/symbols/rj45.png" → bytes, every file under the preloaded public/ folders */
    sizes: Record<string, number>;
    /** "/sfx/pack/bed.flac" → md5 hex of the shipped sound */
    md5: Record<string, string>;
  };
  export default assets;
}
