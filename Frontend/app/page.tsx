"use client";

import { useEffect, useState } from "react";
import { useBootstrap } from "@/lib/useBootstrap";
import Header from "@/components/Header/Header";
import Wall from "@/components/Wall/Wall";
import PlusTag from "@/components/PlusTag/PlusTag";
import ShareModal from "@/components/ShareModal/ShareModal";
import IntroOverlay from "@/components/Intro/IntroOverlay";

const INTRO_SEEN_KEY = "fw.intro.v1";

export default function Page() {
  // Restore session, load the wall, open the live feed.
  useBootstrap();

  const [shareOpen, setShareOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const openShare = () => setShareOpen(true);

  // Show the welcome overlay on a founder's first visit.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem(INTRO_SEEN_KEY)) setIntroOpen(true);
    } catch {
      /* storage disabled — just skip the auto-intro */
    }
  }, []);

  const closeIntro = () => {
    setIntroOpen(false);
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* non-fatal */
    }
  };

  return (
    <main className="page">
      <Header onAbout={() => setIntroOpen(true)} />

      {/* Server-rendered context for search & generative engines. Visually
          hidden (design unchanged) but present in the HTML and read by
          assistive tech — genuine description, not keyword stuffing. */}
      <section className="sr-only" aria-label="About Founder's Wall">
        <h2>About Founder&apos;s Wall</h2>
        <p>
          Founder&apos;s Wall is an anonymous founder community by GoXL — a
          judgment-free wall where startup founders share the problems,
          questions, and wins they can&apos;t say out loud. Post or read honest
          startup advice, ask about founder problems, and support other
          founders. No account is required to read, post, like, or comment.
        </p>
        <p>
          Founder&apos;s Wall is part of GoXL, which builds tools and
          communities for founders and entrepreneurship.
        </p>
      </section>

      <Wall onShare={openShare} />
      <PlusTag onClick={openShare} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
      <IntroOverlay open={introOpen} onClose={closeIntro} />
    </main>
  );
}
