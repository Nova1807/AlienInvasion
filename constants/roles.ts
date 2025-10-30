export type RoleId = 'alienKatze' | 'seher' | 'doktor' | 'dorfkatze';

export type TeamId = 'aliens' | 'dorf';

export type RoleDefinition = {
  id: RoleId;
  name: string;
  team: TeamId;
  tagline: string;
  ability: string;
  nightAction?: string;
  dayAction?: string;
  minCount?: number;
  maxCount?: number;
  defaultCount?: number;
  selectable?: boolean;
};

export const roleCatalog: RoleDefinition[] = [
  {
    id: 'alienKatze',
    name: 'Alienkatze',
    team: 'aliens',
    tagline: 'Schleicht nachts durchs Dorf und legt neue Opfer fest.',
    ability: 'Wählt in jeder Nacht gemeinsam eine Katze, die das Spiel verlässt.',
    nightAction: 'Alienkatzen tippen stumm auf den Namen ihres Ziels. Danach schließen sie wieder die Augen.',
    dayAction:
      'Bleibt unauffällig und lenkt das Dorf mit plausiblen Geschichten ab.',
    minCount: 1,
    defaultCount: 2,
    selectable: true,
  },
  {
    id: 'seher',
    name: 'Seher',
    team: 'dorf',
    tagline: 'Scannt jede Nacht eine Katze auf außerirdische Energie.',
    ability:
      'Darf pro Nacht eine Katze überprüfen und erfährt, ob sie außerirdisch ist.',
    nightAction: 'Zeigt mit geschlossenen Augen auf einen Namen. Die App verrät heimlich Alien oder Dorf.',
    dayAction:
      'Teilt Hinweise vorsichtig mit dem Dorf, ohne sich zu verraten.',
    maxCount: 1,
    defaultCount: 1,
    selectable: true,
  },
  {
    id: 'doktor',
    name: 'Doktor',
    team: 'dorf',
    tagline: 'Heilt Dorfkatzen mit galaktischer Medizin.',
    ability:
      'Darf jede Nacht eine Katze (auch sich selbst) schützen. Das Opfer überlebt, wenn es geschützt wurde.',
    nightAction: 'Tippt heimlich den Namen der Katze an, die diese Nacht sicher ist.',
    dayAction:
      'Kann behaupten, wen sie beschützt hat – doch Vorsicht vor misstrauischen Blicken.',
    maxCount: 1,
    defaultCount: 1,
    selectable: true,
  },
  {
    id: 'dorfkatze',
    name: 'Dorfkatze',
    team: 'dorf',
    tagline: 'Verlässt sich auf Instinkt und das Miauen der Nachbarn.',
    ability: 'Keine Spezialfähigkeit, aber volle Stimme bei Abstimmungen.',
    dayAction:
      'Diskutiert, beobachtet und stimmt ab. Arbeitet mit den Hinweisen der Spezialrollen zusammen.',
    selectable: false,
  },
];

export const selectableRoles = roleCatalog.filter((role) => role.selectable);
export const displayRoles = roleCatalog.filter((role) => role.id !== 'dorfkatze');

export function getRoleDefinition(roleId: RoleId): RoleDefinition {
  const role = roleCatalog.find((entry) => entry.id === roleId);
  if (!role) {
    throw new Error(`Unknown role id: ${roleId}`);
  }
  return role;
}
