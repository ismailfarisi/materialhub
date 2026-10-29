import { type Static, Type } from "@sinclair/typebox";

export const CreatorPortfolioVideoKind = Type.Union([
  Type.Literal("sample"),
  Type.Literal("intro"),
]);
export type CreatorPortfolioVideoKind = Static<typeof CreatorPortfolioVideoKind>;

export const CreatorPortfolioFinalizeBody = Type.Object({
  key: Type.String({ minLength: 1 }),
  kind: CreatorPortfolioVideoKind,
  caption: Type.Optional(Type.Union([Type.String({ maxLength: 255 }), Type.Null()])),
});
export type CreatorPortfolioFinalizeBody = Static<typeof CreatorPortfolioFinalizeBody>;
