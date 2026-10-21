'use client';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
export function Artwork({
  uri,
  alt,
  className = '',
}: {
  uri?: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState('');
  return uri && failed !== uri ? (
    <img
      className={'artwork ' + className}
      src={'/media?url=' + encodeURIComponent(uri)}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(uri)}
    />
  ) : (
    <div className={'artwork artwork-placeholder ' + className}>
      <ImageOff size={30} />
      <span>{uri ? 'Media unavailable' : 'Artwork preview'}</span>
    </div>
  );
}
