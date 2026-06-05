import React from 'react';
import { MapPin } from 'lucide-react';

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
      className="h-[120px] bg-[#F3F4F6] rounded-[10px] flex flex-col items-center justify-center cursor-pointer overflow-hidden"
    >
      <MapPin size={28} color="#9CA3AF" />
      <p className="text-[13px] text-[#6B7280] mt-1 px-4 text-center truncate w-full">
        {address}
      </p>
    </div>
  );
};
