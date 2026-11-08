import type { Metadata, Viewport } from "next";
import { Google_Sans, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { InstallPrompt } from "@/components/InstallPrompt";
import { PwaRegister } from "@/components/PwaRegister";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { AutoGrow } from "@/components/AutoGrow";
import { OfflineSeed } from "@/components/OfflineSeed";
import "./globals.css";

const googleSans = Google_Sans({
  variable: "--font-google-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FAFC Media Engine",
  description: "Real-time sermon transcription, notes, and punchy quotes.",
  applicationName: "FAFC Media Engine",
  // iPhone/iPad "Add to Home Screen": open full screen with its own title.
  appleWebApp: { capable: true, title: "FAFC Media", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// Mobile: real device width, notch-aware (viewport-fit cover + safe-area padding), browser chrome tinted to the theme.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${googleSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");var sa=localStorage.getItem("skinAccent");if(sa)document.documentElement.dataset.theme=sa;var ss=localStorage.getItem("skinSurface");if(ss&&ss!=="default")document.documentElement.dataset.surface=ss}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-gray-100/50!">
        <QueryProvider>
          <AuthProvider>
            <NavBar />
            {children}
          </AuthProvider>
        </QueryProvider>
        <InstallPrompt />
        <PwaRegister />
        <UpdatePrompt />
        <AutoGrow />
        <OfflineSeed />
      </body>
    </html>
  );
}
