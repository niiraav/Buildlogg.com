/**
 * Web Push encryption + sending using aes128gcm (RFC 8188).
 *
 * Cloudflare Workers/Pages Functions can't use the `web-push` npm package
 * directly, so this implements the full Web Push protocol from scratch
 * using the Web Crypto API:
 *
 *   1. ECDH key agreement (local VAPID private key × subscriber p256dh)
 *   2. HKDF to derive the content encryption key + nonce
 *   3. AES-128-GCM encryption of the payload (RFC 8188 aes128gcm encoding)
 *   4. VAPID JWT (ES256) for Authorization header
 *   5. POST to the push endpoint with proper headers
 *
 * References:
 *   - RFC 8188: https://datatracker.ietf.org/doc/html/rfc8188
 *   - Web Push Protocol: https://datatracker.ietf.org/doc/html/rfc8030
 *   - VAPID: https://datatracker.ietf.org/doc/html/rfc8292
 */

// ─── Base64 helpers ───────────────────────────────────────────────

function base64UrlEncode(bytes) {
  let str = '';
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

// ─── HKDF (RFC 5869) ──────────────────────────────────────────────

async function hkdf(salt, ikm, info, length) {
  const keyMaterial = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);

  // HKDF extract + expand in one step (Web Crypto API)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt,
      info: info,
    },
    keyMaterial,
    length * 8,
  );

  return new Uint8Array(derivedBits);
}

// ─── VAPID JWT (ES256) ───────────────────────────────────────────

async function createVapidJWT(vapidPrivateKey, audience) {
  const enc = new TextEncoder();

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: 'mailto:noreply@buildlogg.com',
  };

  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the ECDSA P-256 private key (VAPID private key is base64url-encoded PKCS8)
  const keyData = base64UrlDecode(vapidPrivateKey);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  // ES256 uses SHA-256
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    enc.encode(signingInput),
  );

  // Web Crypto returns DER-encoded signature; convert to raw r||s for JOSE
  const rawSignature = derToRaw(new Uint8Array(signature));
  const signatureB64 = base64UrlEncode(rawSignature);

  return `${signingInput}.${signatureB64}`;
}

// Convert DER-encoded ECDSA signature to raw r||s (JOSE format)
function derToRaw(signature) {
  const raw = new Uint8Array(64);
  const offset = {
    r: 4, // skip sequence + integer tag + length
    s: 0,
  };

  // Parse DER: 0x30 <len> 0x02 <len> <r> 0x02 <len> <s>
  if (signature[0] !== 0x30) throw new Error('Invalid DER signature');
  const rLen = signature[3];
  const rStart = 4;
  const rBytes = signature.slice(rStart, rStart + rLen);

  const sLen = signature[rStart + rLen + 1];
  const sStart = rStart + rLen + 2;
  const sBytes = signature.slice(sStart, sStart + sLen);

  // r and s are big-endian, may have leading zero padding
  raw.set(rBytes.slice(-32), 32 - rBytes.length > 0 ? 32 - Math.min(rBytes.length, 32) : 0);
  raw.set(sBytes.slice(-32), 32 - sBytes.length > 0 ? 32 - Math.min(sBytes.length, 32) : 0);

  return raw;
}

// ─── aes128gcm Content Encryption (RFC 8188) ─────────────────────

/**
 * Encrypt a payload using aes128gcm content encoding (RFC 8188).
 *
 * @param {Uint8Array} plaintext - The JSON payload to encrypt
 * @param {string} p256dh - Subscriber's P-256 public key (base64url)
 * @param {string} auth - Subscriber's auth secret (base64url)
 * @param {string} vapidPrivateKey - Server's VAPID private key (base64url, PKCS8)
 * @returns {Promise<Uint8Array>} - Encrypted content (binary)
 */
async function encryptPayload(plaintext, p256dh, auth, vapidPrivateKey) {
  const enc = new TextEncoder();

  // 1. Import subscriber's public key (P-256 ECDH)
  const subscriberPublicKey = base64UrlDecode(p256dh);
  const subscriberPubKeyCrypto = await crypto.subtle.importKey(
    'raw',
    subscriberPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // 2. Import server's VAPID private key for ECDH
  const serverKeyData = base64UrlDecode(vapidPrivateKey);
  const serverPrivateKey = await crypto.subtle.importKey(
    'pkcs8',
    serverKeyData,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );

  // 3. ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: subscriberPubKeyCrypto },
      serverPrivateKey,
      256, // 32 bytes
    ),
  );

  // 4. Generate random 16-byte salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // 5. HKDF info strings
  // authSecret = HKDF(auth, sharedSecret, "WebPush: info\0", 32)
  // contentEncryptionKey = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)
  // nonce = HKDF(salt, IKM, "Content-Encoding: nonce\0", 12)

  // 5a. First HKDF: derive Pseudo-Random Key (PRK) from auth secret + shared secret
  const authSecret = base64UrlDecode(auth);

  // Key info for Web Push: "WebPush: info\0" + subscriberPubKey + serverPubKey
  // We need the server's public key for the info context
  const serverKeyPair = await crypto.subtle.importKey(
    'pkcs8',
    serverKeyData,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign'],
  );
  // Export server public key (we'll derive from the key pair)
  // Actually, we need the raw public key. Let's re-import as ECDH to export.
  const serverEcdhKey = await crypto.subtle.importKey(
    'pkcs8',
    serverKeyData,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const serverPubKeyRaw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', serverEcdhKey)),
  );

  // Web Push info: "WebPush: info\0" || subscriber_pub || server_pub
  const webPushInfo = new Uint8Array(
    15 + // "WebPush: info\0"
    65 + // subscriber public key (uncompressed P-256: 0x04 + 32 + 32)
    65,  // server public key
  );
  webPushInfo.set(enc.encode('WebPush: info'), 0);
  // null byte after "WebPush: info"
  webPushInfo[14] = 0;
  webPushInfo.set(subscriberPublicKey, 15);
  webPushInfo.set(serverPubKeyRaw, 80);

  // IKM = HKDF(authSecret, sharedSecret, webPushInfo, 32)
  const ikm = await hkdf(authSecret, sharedSecret, webPushInfo, 32);

  // 5b. Content Encryption Key = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = enc.encode('Content-Encoding: aes128gcm');
  const cekInfoWithNull = new Uint8Array(cekInfo.length + 1);
  cekInfoWithNull.set(cekInfo, 0);
  cekInfoWithNull[cekInfo.length] = 0;
  const contentEncryptionKey = await hkdf(salt, ikm, cekInfoWithNull, 16);

  // 5c. Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = enc.encode('Content-Encoding: nonce');
  const nonceInfoWithNull = new Uint8Array(nonceInfo.length + 1);
  nonceInfoWithNull.set(nonceInfo, 0);
  nonceInfoWithNull[nonceInfo.length] = 0;
  const nonce = await hkdf(salt, ikm, nonceInfoWithNull, 12);

  // 6. Build the RFC 8188 record structure
  // Padding: plaintext + 0x02 (delimiter byte for aes128gcm)
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext, 0);
  padded[plaintext.length] = 2; // padding delimiter

  // Encrypt with AES-128-GCM
  const aesKey = await crypto.subtle.importKey(
    'raw',
    contentEncryptionKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, tagLength: 128 },
      aesKey,
      padded,
    ),
  );

  // 7. Build the final aes128gcm record (RFC 8188 §2)
  // Header: salt (16) || record_size (4) || key_id (4 = 0x00000000 for VAPID)
  // Body: encrypted (ciphertext + 16-byte GCM tag)
  const recordSize = 16 + 4 + 4 + encrypted.length; // total record size
  const header = new Uint8Array(16 + 4 + 4);
  header.set(salt, 0);
  // record size as 32-bit big-endian
  const dv = new DataView(header.buffer);
  dv.setUint32(16, recordSize, false);
  // key_id length = 0 (no key ID for VAPID)
  dv.setUint32(20, 0, false);

  const result = new Uint8Array(header.length + encrypted.length);
  result.set(header, 0);
  result.set(encrypted, header.length);

  return result;
}

// ─── Send Web Push ───────────────────────────────────────────────

/**
 * Send an encrypted Web Push notification.
 *
 * @param {Object} env - Cloudflare env with VAPID_PRIVATE_KEY and VAPID_PUBLIC_KEY
 * @param {string} endpoint - Push subscription endpoint URL
 * @param {Object} keys - { p256dh, auth } from the PushSubscription
 * @param {Object} notification - { title, body, url }
 * @returns {Promise<{ ok: boolean, status: number, error?: string }>}
 */
export async function sendWebPush(env, endpoint, keys, notification) {
  if (!endpoint || !env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) {
    return { ok: false, status: 0, error: 'missing config' };
  }

  if (!keys || !keys.p256dh || !keys.auth) {
    return { ok: false, status: 0, error: 'missing subscription keys' };
  }

  try {
    const audience = new URL(endpoint).origin;

    // 1. Create VAPID JWT
    const jwt = await createVapidJWT(env.VAPID_PRIVATE_KEY, audience);

    // 2. Build and encrypt the payload
    const payload = JSON.stringify({
      notification: {
        title: notification.title || 'Buildlogg',
        body: notification.body || '',
        data: { url: notification.url || '/app/' },
      },
    });
    const plaintext = new TextEncoder().encode(payload);
    const encrypted = await encryptPayload(
      plaintext,
      keys.p256dh,
      keys.auth,
      env.VAPID_PRIVATE_KEY,
    );

    // 3. POST to the push endpoint
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        'TTL': '86400',
      },
      body: encrypted,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[sendWebPush] ${response.status} from ${endpoint}: ${errText}`);
      return { ok: false, status: response.status, error: errText };
    }

    return { ok: true, status: 200 };
  } catch (err) {
    console.error('[sendWebPush] Error:', err.message);
    return { ok: false, status: 0, error: err.message };
  }
}
