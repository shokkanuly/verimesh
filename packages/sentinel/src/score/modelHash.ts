import { keccak256, toHex, stringToBytes, type Hex } from 'viem';

export function computeModelHash(sourceCode: string, configJson: string): Hex {
  const normalizedSource = sourceCode.replace(/\r\n/g, '\n').trim();
  const normalizedConfig = configJson.replace(/\r\n/g, '\n').trim();
  return keccak256(stringToBytes(`${normalizedSource}\n---CONFIG---\n${normalizedConfig}`));
}
