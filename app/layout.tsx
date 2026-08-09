import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "内容工作台",
  description: "跨设备项目计时与进度管理",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
