import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Search, Bell, Settings } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Breadcrumb from "@/components/Breadcrumb";
import UserMenu from "@/components/UserMenu";
import { DataProvider } from "@/lib/store";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "RASA Constructions",
  description: "RASA Constructions ERP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <DataProvider>
        <div className="layout-container">
          <h1 className="brand">RASA</h1>

          {/* Header */}
          <header className="header">
            <Breadcrumb />
            <div className="header-right">
              <div className="search-bar">
                <Search size={18} color="#8c8c9a" />
                <input type="text" placeholder="Search..." />
              </div>
              <div className="header-icon"><Bell size={18} /></div>
              <div className="header-icon"><Settings size={18} /></div>
              <UserMenu />
            </div>
          </header>

          {/* Sidebar */}
          <Sidebar />

          {/* Main Content Area */}
          <main className="main-content">

            {/* Page Content */}
            {children}
          </main>
        </div>
        </DataProvider>
      </body>
    </html>
  );
}
