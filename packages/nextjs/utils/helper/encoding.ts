import { hexlify, toUtf8Bytes } from "ethers";

export function stringToBigInt(str: string): bigint {
  const bytes = toUtf8Bytes(str);
  const hex = hexlify(bytes).substring(2);

  return BigInt("0x" + hex);
}

export function bigIntToString(bn: bigint): string {
  let hex = bn.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;

  return Buffer.from(hex, "hex").toString("utf8");
}