import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AssetTrack | Equipment & inventory', description: 'Equipment loans and decentralized annual stocktakes.' };
export default function Layout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
