/**
 * Pretty QR Code factory — creates a styled QRCodeStyling instance with
 * Buildlogg brand styling: smooth rounded dots, brand-black colour,
 * embedded logo, quiet zone, high error correction.
 *
 * Equivalent of Flutter's pretty_qr for web.
 */
import QRCodeStyling from 'qr-code-styling';

export function createPrettyQR(url: string, logoDataUrl?: string): QRCodeStyling {
  return new QRCodeStyling({
    width: 600,
    height: 600,
    type: 'canvas',
    data: url,
    margin: 8, // Quiet zone: on
    qrOptions: {
      errorCorrectionLevel: 'H', // High ECC for logo embed
    },
    dotsOptions: {
      type: 'rounded', // Style: smooth
      color: '#0E1828', // brand-deep
    },
    cornersSquareOptions: {
      type: 'extra-rounded', // Rounded corner squares
      color: '#0E1828',
    },
    cornersDotOptions: {
      type: 'dot', // Rounded corner dots
      color: '#111827',
    },
    image: logoDataUrl === undefined ? '/brand/icon-transparent-square-v2.png' : (logoDataUrl || undefined), // undefined=brand icon, null=no image, string=custom
    imageOptions: {
      crossOrigin: 'anonymous',
      hideBackgroundDots: true, // Clean area behind logo
      imageSize: 0.3, // Logo covers 30% of QR
      margin: 4,
    },
  });
}

export async function qrToDataUrl(url: string, logoDataUrl?: string | null): Promise<string | null> {
  try {
    const qr = createPrettyQR(url, logoDataUrl ?? undefined);
    const blob = await qr.getRawData('png');
    if (!blob) return null;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob as Blob);
    });
  } catch {
    return null;
  }
}
