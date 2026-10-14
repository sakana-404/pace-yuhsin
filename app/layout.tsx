import type { Metadata } from 'next';
export const metadata:Metadata={title:'PACE 校園運動',description:'校園運動紀錄與班級課程管理'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>}
