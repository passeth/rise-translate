import { MeetingRoom } from "@/features/livekit/meeting-room";

type PageProps = {
  params: Promise<{ publicToken: string }>;
};

export default async function MeetingRoomPage({ params }: PageProps) {
  const { publicToken } = await params;
  return <MeetingRoom publicToken={publicToken} />;
}
