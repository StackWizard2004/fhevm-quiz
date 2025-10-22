"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeployedContractInfo } from "./helper";
import { useWagmiEthers } from "./wagmi/useWagmiEthers";
import {
  FhevmInstance,
  buildParamsFromAbi,
  getEncryptionMethod,
  useFHEDecrypt,
  useFHEEncryption,
  useInMemoryStorage,
} from "@fhevm-sdk";
import { ethers } from "ethers";
import { useReadContract } from "wagmi";
import type { Contract } from "~~/utils/helper/contract";
import { bigIntToString, stringToBigInt } from "~~/utils/helper/encoding";
import type { AllowedChainIds } from "~~/utils/helper/networks";

/**
 * @hook useFHEZamaQuiz
 * @notice Manages encryption, decryption, and interaction with the FHEZamaQuiz contract.
 */
export const useFHEZamaQuiz = ({
  instance,
  initialMockChains,
}: {
  instance: FhevmInstance | undefined;
  initialMockChains?: Readonly<Record<number, string>>;
}) => {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const { chainId, accounts, isConnected, ethersReadonlyProvider, ethersSigner } = useWagmiEthers(initialMockChains);

  const allowedChainId = typeof chainId === "number" ? (chainId as AllowedChainIds) : undefined;
  const { data: fheZamaQuiz } = useDeployedContractInfo({
    contractName: "FHEZamaQuiz",
    chainId: allowedChainId,
  });

  type FHEZamaQuizInfo = Contract<"FHEZamaQuiz"> & { chainId?: number };

  const [message, setMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const hasContract = Boolean(fheZamaQuiz?.address && fheZamaQuiz?.abi);
  const hasSigner = Boolean(ethersSigner);
  const hasProvider = Boolean(ethersReadonlyProvider);

  const getContract = (mode: "read" | "write") => {
    if (!hasContract) return undefined;
    const providerOrSigner = mode === "read" ? ethersReadonlyProvider : ethersSigner;
    if (!providerOrSigner) return undefined;
    return new ethers.Contract(fheZamaQuiz!.address, (fheZamaQuiz as FHEZamaQuizInfo).abi, providerOrSigner);
  };

  // Fetch user's encrypted answer
  const { data: encryptedAnswer, refetch: refreshAnswer } = useReadContract({
    address: hasContract ? (fheZamaQuiz!.address as `0x${string}`) : undefined,
    abi: hasContract ? ((fheZamaQuiz as FHEZamaQuizInfo).abi as any) : undefined,
    functionName: "getEncryptedAnswer",
    args: [accounts?.[0] ?? ""],
    query: {
      enabled: !!(hasContract && hasProvider),
      refetchOnWindowFocus: false,
    },
  });

  const answerHandle = useMemo(() => encryptedAnswer as string | undefined, [encryptedAnswer]);

  const hasAnswered = useMemo(() => {
    return Boolean(answerHandle && answerHandle !== ethers.ZeroHash && answerHandle !== "0x" && answerHandle !== "0x0");
  }, [answerHandle]);

  // Prepare FHE decryption
  const requests = useMemo(() => {
    if (!hasContract || !answerHandle) return undefined;
    return [
      {
        handle: answerHandle,
        contractAddress: fheZamaQuiz!.address,
      },
    ] as const;
  }, [hasContract, fheZamaQuiz?.address, answerHandle]);

  const {
    decrypt,
    canDecrypt,
    isDecrypting,
    results,
    message: decMsg,
  } = useFHEDecrypt({
    instance,
    ethersSigner: ethersSigner as any,
    fhevmDecryptionSignatureStorage,
    chainId,
    requests,
  });

  const [decryptedString, setDecryptedString] = useState<string>("");

  useEffect(() => {
    if (!results || Object.keys(results).length === 0) return;
    const handle = Object.keys(results)[0];
    const decryptedBigInt = results[handle];
    if (typeof decryptedBigInt === "bigint") {
      const text = bigIntToString(decryptedBigInt);
      setDecryptedString(text);
    }
  }, [results]);

  useEffect(() => {
    if (decMsg) setMessage(decMsg);
  }, [decMsg]);

  // Encrypt user answer and submit
  const { encryptWith } = useFHEEncryption({
    instance,
    ethersSigner: ethersSigner as any,
    contractAddress: fheZamaQuiz?.address,
  });

  const getEncryptionMethodFor = (functionName: "submitAnswer") => {
    const functionAbi = fheZamaQuiz?.abi.find(item => item.type === "function" && item.name === functionName);
    if (!functionAbi) {
      return { method: undefined as string | undefined, error: `Function ABI not found for ${functionName}` };
    }
    const firstInput = functionAbi.inputs?.[0];
    return { method: getEncryptionMethod(firstInput?.internalType), error: undefined };
  };

  const submitAnswer = useCallback(
    async (answerString: string) => {
      if (!answerString || isProcessing) return;
      setIsProcessing(true);
      setMessage(`Submitting answer "${answerString}"...`);
      try {
        const { method, error } = getEncryptionMethodFor("submitAnswer");
        if (!method) return setMessage(error ?? "Encryption method not found");

        const encoded = stringToBigInt(answerString);
        const enc = await encryptWith(builder => (builder as any)[method](encoded));
        if (!enc) return setMessage("Encryption failed");

        const writeContract = getContract("write");
        if (!writeContract) return setMessage("Contract not available");

        const params = buildParamsFromAbi(enc, [...fheZamaQuiz!.abi] as any[], "submitAnswer");
        const tx = await writeContract.submitAnswer(...params, { gasLimit: 400_000 });
        await tx.wait();

        await refreshAnswer();
        setMessage("✅ Quiz submitted successfully!");
      } catch (err) {
        setMessage(`❌ ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [encryptWith, getContract, fheZamaQuiz?.abi, isProcessing],
  );

  return {
    submitAnswer,
    decrypt,
    canDecrypt,
    isDecrypting,
    message,
    isProcessing,
    decryptedString,
    hasAnswered,
    answerHandle,
    hasContract,
    hasSigner,
    chainId,
    accounts,
    isConnected,
  };
};
