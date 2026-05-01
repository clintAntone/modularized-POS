import React, { useState } from 'react';
import { getInitials } from '../../lib/payroll';

interface ProfileAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
  initialsClassName?: string;
}

/**
 * Renders a profile image with an automatic initials fallback when the image
 * fails to load (e.g. 500 from storage server, missing file, CORS error).
 */
export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  name,
  src,
  className = 'w-full h-full object-cover',
  initialsClassName = '',
}) => {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={className}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className={`flex items-center justify-center w-full h-full font-black italic text-slate-300 select-none ${initialsClassName}`}>
      {getInitials(name)}
    </span>
  );
};
