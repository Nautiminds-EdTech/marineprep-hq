// "Ask Claude" actions in the blog editor, shared by the editor (labels) and the server (prompts).
export const ASSIST_LABELS = {
  rewrite: "Rewrite in the house voice",
  shorten: "Shorten",
  simplify: "Simpler words",
  faq: "Add an FAQ",
} as const;
export type AssistKind = keyof typeof ASSIST_LABELS;
