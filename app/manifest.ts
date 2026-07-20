import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "レシートポケット",
    short_name: "レシート",
    description: "レシートを撮影して、かんたん経費管理",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f5f0",
    theme_color: "#f7f5f0",
    icons: []
  };
}
