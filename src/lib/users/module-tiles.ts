// Pure helpers for the module tiles on the user editor (Platform > Companies > company > Users). The same rules as the tiles on the
// company's own Users screen: a tile is switched through the module keys behind it that carry per-user permissions; a tile with none
// follows the company licence for everyone and is shown locked.

export type TileOption = {
  id: string;
  label: string;
  note: string;
  core: boolean;
  moduleKeys: string[];
  controllable: string[];
  licensed?: boolean;
  roleHas?: boolean;
  permissionedKeys?: string[];
  requires?: string[];
  state?: { working: boolean; reason: string } | null;
};

/** The module keys that decide whether the tile is on for the user. */
export function gateKeys(tile: TileOption): string[] {
  return tile.roleHas !== false ? tile.controllable : (tile.permissionedKeys ?? tile.controllable);
}

/** A tile with nothing to switch is always on (it follows the licence); otherwise it is on when any of its keys is selected. */
export function tileIsOn(tile: TileOption, selected: readonly string[]): boolean {
  const keys = gateKeys(tile);
  return keys.length === 0 || keys.some((key) => selected.includes(key));
}

export function tileIsLocked(tile: TileOption): boolean {
  return tile.controllable.length === 0;
}

/** The tiles this tile needs that are switched off for the user (Pick slips needs Job parts & ordering and Stock levels). */
export function missingTiles(tile: TileOption, all: readonly TileOption[], selected: readonly string[]): TileOption[] {
  return (tile.requires ?? []).map((id) => all.find((t) => t.id === id)).filter((t): t is TileOption => Boolean(t) && !tileIsOn(t as TileOption, selected));
}

/** Clicking a tile gives the user every module behind it, or takes them all away. */
export function toggleTile(tile: TileOption, selected: readonly string[]): string[] {
  if (tileIsLocked(tile)) return [...selected];
  const next = new Set(selected);
  const has = gateKeys(tile).some((key) => next.has(key));
  for (const key of tile.controllable) {
    if (has) next.delete(key);
    else next.add(key);
  }
  return Array.from(next);
}

/** A new user starts with everything the company has switched on; the user type's own permissions still decide what they can do. */
export function allModuleKeys(tiles: readonly TileOption[], availableModules: ReadonlyArray<{ moduleKey: string }> = []): string[] {
  if (tiles.length > 0) return Array.from(new Set(tiles.flatMap((tile) => tile.controllable)));
  return availableModules.slice(0, 2).map((m) => m.moduleKey);
}

/** "5 modules", or "All 12 modules" when the user has every module the company offers. */
export function moduleSummary(count: number, total: number): string {
  if (count === 0) return "No modules";
  if (total > 0 && count >= total) return `All ${total} modules`;
  return `${count} ${count === 1 ? "module" : "modules"}`;
}

export function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export type UserRowLike = { displayName: string; email: string; role: string; active: boolean; membershipStatus: string };

/** "active" = can sign in and the membership is active; anything else counts as disabled in the list. */
export function userStatus(user: Pick<UserRowLike, "active" | "membershipStatus">): "active" | "disabled" {
  return user.active && user.membershipStatus === "ACTIVE" ? "active" : "disabled";
}

export function filterUsers<T extends UserRowLike>(users: readonly T[], filter: { search: string; role: string; status: string }): T[] {
  const term = filter.search.trim().toLowerCase();
  return users.filter((user) => {
    if (term && !user.displayName.toLowerCase().includes(term) && !user.email.toLowerCase().includes(term)) return false;
    if (filter.role && user.role !== filter.role) return false;
    if (filter.status === "active" && userStatus(user) !== "active") return false;
    if (filter.status === "disabled" && userStatus(user) !== "disabled") return false;
    return true;
  });
}
