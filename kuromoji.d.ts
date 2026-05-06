// kuromoji has no upstream type definitions. Declare the minimal surface used by
// scripts/ingest-mext-foods.ts (currently the only import site). Extend as needed.
declare module "kuromoji" {
  export type Token = { surface_form: string; reading?: string };
  export type Tokenizer = { tokenize(text: string): Token[] };
  export type Builder = {
    build(cb: (err: Error | null, tokenizer: Tokenizer) => void): void;
  };
  const kuromoji: { builder(opts: { dicPath: string }): Builder };
  export default kuromoji;
}
