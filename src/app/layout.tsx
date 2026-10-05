export const metadata = {
  title: "PLO — Product Loop Optimization",
  description: "idea → spec → build → measure → learn → decide",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          background: "#0b1020",
          color: "#e5e7eb",
        }}
      >
        {children}
      </body>
    </html>
  );
}
