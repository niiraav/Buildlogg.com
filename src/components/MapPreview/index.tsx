import React, { useState } from 'react';
import { MapPin, ExternalLink, Navigation } from 'lucide-react';

export interface MapPreviewProps {
  address: string;
  onTap?: () => void;
}

export const MapPreview: React.FC<MapPreviewProps> = ({ address, onTap }) => {
  const [error, setError] = useState(false);

  if (!address) return null;

  const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  const handleClick = () => {
    if (onTap) {
      onTap();
    } else {
      window.location.href = mapsUrl;
    }
  };

  const handleDirections = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `https://maps.google.com/maps?daddr=${encodeURIComponent(address)}`;
  };

  // Fallback placeholder if iframe fails
  if (error) {
    return (
      <div
        onClick={handleClick}
        className="h-[120px] rounded-lg flex flex-col items-center justify-center cursor-pointer overflow-hidden relative map-fallback-grid bg-[length:12px_12px]"
      >
        <MapPin size={28} className="text-brand-muted" />
        <p className="text-sm text-brand-mid mt-1 px-4 text-center truncate w-full">
          {address}
        </p>
        <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-label text-brand-dark">
          <ExternalLink size={10} />
          Open in Maps
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden h-[140px] group">
      {/* Real map iframe */}
      <iframe
        src={embedUrl}
        width="100%"
        height="140"
        className="border-0 pointer-events-none"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onError={() => setError(true)}
        title={`Map of ${address}`}
      />
      
      {/* Click overlay — taps open full Google Maps */}
      <div
        onClick={handleClick}
        className="absolute inset-0 cursor-pointer"
        aria-label="Open map"
      />

      {/* Directions button */}
      <button
        onClick={handleDirections}
        className="absolute top-2 right-2 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
        aria-label="Get directions"
      >
        <Navigation size={16} className="text-brand-black" />
      </button>
    </div>
  );
};
