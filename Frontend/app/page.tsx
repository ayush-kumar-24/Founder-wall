"use client";

import { useState } from "react";
import { useBootstrap } from "@/lib/useBootstrap";
import Header from "@/components/Header/Header";
import Hero from "@/components/Hero/Hero";
import Wall from "@/components/Wall/Wall";
import ShareModal from "@/components/ShareModal/ShareModal";

export default function Page() {
  // Restore session, load the wall, open the live feed (existing hook).
  useBootstrap();

  const [shareOpen, setShareOpen] = useState(false);
  const openShare = () => setShareOpen(true);

  return (
    <main className="page">
      <Header onShare={openShare} />
      <Hero />
      <Wall onShare={openShare} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </main>
  );
}
