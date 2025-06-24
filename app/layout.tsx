import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from './context/AuthContext';
import { Analytics } from '@vercel/analytics/next';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Your Footprint',
  description: 'A simple working website',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>{children}</AuthProvider>
        <footer className="text-center py-4 text-gray-600 text-sm">
          © 2025 Your Footprint. All rights reserved.
        </footer>
        <Analytics />
      </body>
    </html>
  );
} 