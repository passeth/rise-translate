export type ScopedParticipant = {
  id: string;
  status: string;
};

export function isActiveScopedParticipant(participant: ScopedParticipant | null | undefined): participant is ScopedParticipant {
  return participant?.status === "joining" || participant?.status === "active";
}
