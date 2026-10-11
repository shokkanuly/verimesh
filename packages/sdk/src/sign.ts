import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes, type Hex } from 'viem';
import type { P256Signer, P256PublicKey, P256Signature } from './types.js';

export function createSigner(privateKeyHex: Hex): P256Signer {
  const privBytes = hexToBytes(privateKeyHex);
  const pub = p256.getPublicKey(privBytes, false);
  const xHex = bytesToHex(pub.slice(1, 33));
  const yHex = bytesToHex(pub.slice(33, 65));

  return {
    publicKey(): P256PublicKey {
      return { x: xHex, y: yHex };
    },

    async signDigest(digest: Hex): Promise<P256Signature> {
      const digestBytes = hexToBytes(digest);
      // Low-s and prehash: false to sign precomputed 32-byte digest
      const sig = p256.sign(digestBytes, privBytes, { lowS: true, prehash: false });
      const raw = sig.toCompactRawBytes();
      const rHex = bytesToHex(raw.slice(0, 32));
      const sHex = bytesToHex(raw.slice(32, 64));
      return { r: rHex, s: sHex };
    },
  };
}
