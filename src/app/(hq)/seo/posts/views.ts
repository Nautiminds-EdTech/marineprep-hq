// Tabs on the posts list. A plain module (not "use client") so the server page can read it too.
export const VIEWS = [
  { id: "all", label: "All" },
  { id: "waiting", label: "Waiting" },
  { id: "drafts", label: "Drafts" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Live" },
  { id: "archived", label: "Archived" },
] as const;
export type View = (typeof VIEWS)[number]["id"];
