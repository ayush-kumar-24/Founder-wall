import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Founder's Wall — Anonymous Founder Community by GoXL",
    short_name: "Founder's Wall",
    description:
      "An anonymous community by GoXL where startup founders share the problems, questions, and wins they can't say out loud.",
    start_url: "/",
    display: "standalone",
    background_color: "#ece0c4",
    theme_color: "#ece0c4",
    categories: ["business", "productivity", "social"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
