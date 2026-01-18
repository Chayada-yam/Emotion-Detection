import type { Metadata } from "next";
// 1. เปลี่ยนฟอนต์เป็น Mali (ลายมือ) หรือ Kanit ก็ได้
import { Mali } from "next/font/google"; 
import "./globals.css";

// 2. ตั้งค่าฟอนต์
const mainFont = Mali({
  variable: "--font-main", // ชื่อตัวแปร
  subsets: ["thai", "latin"], // รองรับภาษาไทย
  weight: ["300", "400", "500", "600", "700"], // โหลดความหนาหลายระดับ
  display: "swap",
});

// 3. ตั้งชื่อเว็บและคำอธิบาย
export const metadata: Metadata = {
  title: "Face Emotion AI",
  description: "ระบบตรวจจับอารมณ์ด้วย AI สไตล์พาสเทล",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // 4. เปลี่ยนเป็น lang="th"
    <html lang="th" className="scroll-smooth"> 
      <body
        className={`
          ${mainFont.variable} 
          antialiased 
          font-sans 
          
          /* สีพื้นหลังและตัวหนังสือจากธีม */
          bg-background 
          text-foreground 
          min-h-screen
          
          /* สีตอนเอาเมาส์ลากคลุมดำตัวหนังสือ (Highlight) */
          selection:bg-primary/30 
          selection:text-foreground
        `}
      >
        {children}
      </body>
    </html>
  );
}