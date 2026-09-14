import type { Metadata } from 'next';
import en from '@/messages/en.json';
import './globals.css';
export const metadata:Metadata={title:en.meta.title,description:en.meta.description};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" dir="ltr"><body>{children}</body></html>;}
