import type { Metadata } from "next";
import { VideoStudio } from "@/components/video-studio/studio";
import { liveEnabled } from "@/domains/video-studio/provider";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Intro studio · Proof of concept",
  robots: { index: false, follow: false },
};
export default function VideoStudioPage() {
  return <VideoStudio liveAvailable={liveEnabled()} />;
}
