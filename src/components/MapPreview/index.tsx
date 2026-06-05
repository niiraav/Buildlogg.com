import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';

export interface MapPreviewProps {
  address: string;
  onTap?: () => void;
}

export const MapPreview: React.FC<MapPreviewProps> = ({ address, onTap }) => {
  if (!address) return null;

  const handleClick = () => {
    if (onTap) {
      onTap();
    } else {
      window.open(
        `https://maps.google.com/?q=${encodeURIComponent(address)}`,
        '_blank'
      );
    }
  };

  return (
    <div
      onClick={handleClick}
      className="h-[120px] rounded-[10px] flex flex-col items-center justify-center cursor-pointer overflow-hidden relative bg-[radial-gradient(circle,#E5E7EB_1px,transparent_1px)] bg-[length:12px_12px]"
    >
      <MapPin size={28} color="#9CA3AF" />
      <p className="text-[13px] text-[#6B7280] mt-1 px-4 text-center truncate w-full">
        {address}
      </p>
      <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[11px] text-[#9CA3AF]">
        <ExternalLink size={10} />
        Open in Maps
      </div>
    </div>
  );
};
