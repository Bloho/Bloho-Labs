'use client';
import { useState } from 'react';
import Image from 'next/image';
export function ContentCover({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  return <div className="content-cover">{src && !failed && <Image src={src} alt={title} width={1222} height={482} unoptimized onError={() => setFailed(true)}/>}</div>;
}
