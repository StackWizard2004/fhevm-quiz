"use client";

import { useState, useEffect, useMemo } from "react";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useFhevm } from "@fhevm-sdk";
import { useFHEZamaQuiz } from "~~/hooks/useFHEZamaQuiz";

export const FHEZamaQuiz = () => {
  const { isConnected, chain } = useAccount();
  const chainId = chain?.id;
  const provider = useMemo(() => (typeof window !== "undefined" ? (window as any).ethereum : undefined), []);
  const initialMockChains = {
    11155111: `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  };

  const { instance: fhevmInstance } = useFhevm({ provider, chainId, initialMockChains, enabled: true });
  const quiz = useFHEZamaQuiz({ instance: fhevmInstance, initialMockChains });

  const [answers, setAnswers] = useState({ q1: "", q2: "", q3: "" });
  const [justSubmitted, setJustSubmitted] = useState(false);
  const allAnswered = answers.q1 && answers.q2 && answers.q3;
  const correctAnswers = "BBA";

  const handleSubmit = async () => {
    const answerString = `${answers.q1}${answers.q2}${answers.q3}`;
    await quiz.submitAnswer(answerString);
    setJustSubmitted(true);
  };

  useEffect(() => {
    if (quiz.decryptedString) {
      const str = quiz.decryptedString;
      setAnswers({
        q1: str[0] || "",
        q2: str[1] || "",
        q3: str[2] || "",
      });
    }
  }, [quiz.decryptedString]);

  if (!isConnected) {
    return (
      <div className="w-full flex flex-col items-center justify-center text-center" style={{ height: "calc(100vh - 60px)" }}>
        <h2 className="text-2xl font-bold mb-4">Connect your wallet to take the quiz 🧠</h2>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  const showResult = Boolean(quiz.decryptedString || justSubmitted);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6 text-gray-900">
      <h1 className="text-3xl font-bold text-center mb-4">🧩 FHE Zama Quiz</h1>
      <p className="text-gray-600 text-center mb-6">
        Answer all 3 questions, then submit to see if you're right — privately with FHE!
      </p>

      {renderQuestion(
        "1️⃣ What does FHE stand for?",
        ["A", "B", "C", "D"],
        [
          "Fast Homomorphic Encryption",
          "Fully Homomorphic Encryption",
          "Functional Hashing Engine",
          "Free Hybrid Encryption",
        ],
        answers.q1,
        v => setAnswers(a => ({ ...a, q1: v })),
        quiz.hasAnswered,
        showResult ? correctAnswers[0] : undefined,
      )}

      {renderQuestion(
        "2️⃣ What can you do with FHE?",
        ["A", "B", "C", "D"],
        [
          "Encrypt data only",
          "Compute on encrypted data",
          "Share private keys",
          "Hack smart contracts",
        ],
        answers.q2,
        v => setAnswers(a => ({ ...a, q2: v })),
        quiz.hasAnswered,
        showResult ? correctAnswers[1] : undefined,
      )}

      {renderQuestion(
        "3️⃣ Which phrase best fits Zama's vision?",
        ["A", "B", "C", "D"],
        [
          "Privacy by default.",
          "Pump it and dump it.",
          "Open the data flood.",
          "One chain to rule them all.",
        ],
        answers.q3,
        v => setAnswers(a => ({ ...a, q3: v })),
        quiz.hasAnswered,
        showResult ? correctAnswers[2] : undefined,
      )}

      {!quiz.hasAnswered && (
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || quiz.isProcessing}
          className="w-full px-6 py-3 rounded-md font-semibold shadow-md bg-[#FFD206] text-gray-900 hover:brightness-110 disabled:opacity-50"
        >
          {quiz.isProcessing ? "⏳ Submitting..." : "🚀 Submit My Answers"}
        </button>
      )}

      {quiz.hasAnswered && !quiz.decryptedString && (
        <button
          onClick={quiz.decrypt}
          disabled={quiz.isProcessing}
          className="w-full px-6 py-3 rounded-md font-semibold shadow-md bg-[#FFD206] hover:brightness-110 disabled:opacity-50"
        >
          {quiz.isProcessing ? "🔄 Decrypting..." : "🔓 Decrypt My Answer"}
        </button>
      )}

      {quiz.message && <p className="mt-4 text-center text-gray-600 italic">{quiz.message}</p>}

      {showResult && quiz.decryptedString && (
        <div className="mt-6 p-5 bg-white border rounded-xl shadow-lg text-center">
          <h3 className="text-xl font-semibold mb-2">✅ Your Results</h3>
          <QuizResult decrypted={quiz.decryptedString} correct={correctAnswers} />
        </div>
      )}
    </div>
  );
};

function renderQuestion(
  title: string,
  labels: string[],
  options: string[],
  selected: string,
  onSelect: (val: string) => void,
  disabled: boolean,
  correctLabel?: string,
) {
  return (
    <div className="bg-[#f4f4f4] p-5 rounded-[10px] shadow-lg mb-4">
      <h3 className="text-lg font-semibold mb-3">{title}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((opt, i) => {
          const label = labels[i];
          const active = selected === label;
          const isCorrect = correctLabel && label === correctLabel;
          const isWrong = correctLabel && active && !isCorrect;
          let className = "p-3 rounded-md border transition-all text-left ";
          if (isCorrect && active) className += "bg-green-200 border-green-500 text-green-900 font-bold";
          else if (isWrong) className += "bg-red-200 border-red-500 text-red-900 font-bold";
          else if (active) className += "bg-[#FFD206] border-yellow-500 text-gray-900 font-bold";
          else className += "bg-white border-gray-300 hover:bg-gray-100";
          return (
            <button
              key={label}
              onClick={() => onSelect(label)}
              disabled={disabled}
              className={`${className} disabled:opacity-60`}
            >
              <strong>{label}.</strong> {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuizResult({ decrypted, correct }: { decrypted?: string; correct: string }) {
  if (!decrypted) return <p className="text-gray-500">Waiting for decryption...</p>;
  const total = correct.length;
  let correctCount = 0;
  for (let i = 0; i < total; i++) if (decrypted[i] === correct[i]) correctCount++;
  const isPerfect = correctCount === total;
  return (
    <div className="mt-4">
      <p className="text-lg font-medium">
        Your answers: <span className="font-mono text-gray-800">{decrypted}</span>
      </p>
      <p className="text-lg font-medium">
        Correct answers: <span className="font-mono text-gray-800">{correct}</span>
      </p>
      {isPerfect ? (
        <p className="text-green-600 font-semibold text-lg mt-2">🎉 Perfect! You got all {total} correct!</p>
      ) : (
        <p className="text-orange-600 font-semibold text-lg mt-2">
          ⚡ You got {correctCount}/{total} correct — nice try!
        </p>
      )}
    </div>
  );
}
