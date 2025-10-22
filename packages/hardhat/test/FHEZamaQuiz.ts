import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { FHEZamaQuiz, FHEZamaQuiz__factory } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { hexlify, toUtf8Bytes } from "ethers";

function stringToBigInt(str: string): bigint {
  const bytes = toUtf8Bytes(str);
  const hex = hexlify(bytes).substring(2);

  return BigInt("0x" + hex);
}

function bigIntToString(bn: bigint): string {
  let hex = bn.toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;

  return Buffer.from(hex, "hex").toString("utf8");
}

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHEZamaQuiz")) as FHEZamaQuiz__factory;
  const quizContract = (await factory.deploy()) as FHEZamaQuiz;
  const quizContractAddress = await quizContract.getAddress();
  return { quizContract, quizContractAddress };
}

describe("FHEZamaQuiz", function () {
  let signers: Signers;
  let quizContract: FHEZamaQuiz;
  let quizContractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`⚠️  This Hardhat test suite only runs in local mock FHEVM`);
      this.skip();
    }
    ({ quizContract, quizContractAddress } = await deployFixture());
  });

  it("should indicate that users haven't answered initially", async function () {
    expect(await quizContract.hasAnswered(signers.alice.address)).to.eq(false);
    expect(await quizContract.hasAnswered(signers.bob.address)).to.eq(false);
  });

  it("should allow a user to submit one quiz answer and prevent double submission", async function () {
    const aliceAnswer = "ABC";
    const aliceAnswerBigInt = stringToBigInt(aliceAnswer);

    const encryptedInput = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(aliceAnswerBigInt)
      .encrypt();

    await (
      await quizContract.connect(signers.alice).submitAnswer(encryptedInput.handles[0], encryptedInput.inputProof)
    ).wait();

    expect(await quizContract.hasAnswered(signers.alice.address)).to.eq(true);

    const decryptedBigInt = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await quizContract.getEncryptedAnswer(signers.alice.address),
      quizContractAddress,
      signers.alice,
    );
    const decryptedAnswer = bigIntToString(decryptedBigInt);
    expect(decryptedAnswer).to.eq(aliceAnswer);

    const encryptedInput2 = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(stringToBigInt("DEF"))
      .encrypt();

    await expect(
      quizContract.connect(signers.alice).submitAnswer(encryptedInput2.handles[0], encryptedInput2.inputProof),
    ).to.be.revertedWith("Already answered");
  });

  it("should allow multiple users to submit independently", async function () {
    const aliceAnswer = "ABC";
    const bobAnswer = "BAC";

    const encryptedAlice = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(stringToBigInt(aliceAnswer))
      .encrypt();

    const encryptedBob = await fhevm
      .createEncryptedInput(quizContractAddress, signers.bob.address)
      .add32(stringToBigInt(bobAnswer))
      .encrypt();

    await (
      await quizContract.connect(signers.alice).submitAnswer(encryptedAlice.handles[0], encryptedAlice.inputProof)
    ).wait();

    await (
      await quizContract.connect(signers.bob).submitAnswer(encryptedBob.handles[0], encryptedBob.inputProof)
    ).wait();

    const decryptedAlice = bigIntToString(
      await fhevm.userDecryptEuint(
        FhevmType.euint32,
        await quizContract.getEncryptedAnswer(signers.alice.address),
        quizContractAddress,
        signers.alice,
      ),
    );
    const decryptedBob = bigIntToString(
      await fhevm.userDecryptEuint(
        FhevmType.euint32,
        await quizContract.getEncryptedAnswer(signers.bob.address),
        quizContractAddress,
        signers.bob,
      ),
    );

    expect(decryptedAlice).to.eq(aliceAnswer);
    expect(decryptedBob).to.eq(bobAnswer);
  });

  it("should correctly track hasAnswered flags for multiple users", async function () {
    const aliceAnswer = "ABC";
    const bobAnswer = "CBA";

    const encryptedAlice = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(stringToBigInt(aliceAnswer))
      .encrypt();

    const encryptedBob = await fhevm
      .createEncryptedInput(quizContractAddress, signers.bob.address)
      .add32(stringToBigInt(bobAnswer))
      .encrypt();

    await (
      await quizContract.connect(signers.alice).submitAnswer(encryptedAlice.handles[0], encryptedAlice.inputProof)
    ).wait();

    expect(await quizContract.hasAnswered(signers.alice.address)).to.eq(true);
    expect(await quizContract.hasAnswered(signers.bob.address)).to.eq(false);

    await (
      await quizContract.connect(signers.bob).submitAnswer(encryptedBob.handles[0], encryptedBob.inputProof)
    ).wait();

    expect(await quizContract.hasAnswered(signers.alice.address)).to.eq(true);
    expect(await quizContract.hasAnswered(signers.bob.address)).to.eq(true);
  });

  it("should handle very short answers correctly", async function () {
    const answer = "A";
    const bigIntValue = stringToBigInt(answer);
    const encrypted = await fhevm
      .createEncryptedInput(quizContractAddress, signers.bob.address)
      .add32(bigIntValue)
      .encrypt();
    await (await quizContract.connect(signers.bob).submitAnswer(encrypted.handles[0], encrypted.inputProof)).wait();

    const decrypted = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      await quizContract.getEncryptedAnswer(signers.bob.address),
      quizContractAddress,
      signers.bob,
    );
    expect(bigIntToString(decrypted)).to.eq(answer);
  });

  it("should store distinct ciphertext for identical plaintext from different users", async function () {
    const answer = "ABC";
    const bigIntValue = stringToBigInt(answer);

    const encA = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(bigIntValue)
      .encrypt();
    const encB = await fhevm
      .createEncryptedInput(quizContractAddress, signers.bob.address)
      .add32(bigIntValue)
      .encrypt();

    await quizContract.connect(signers.alice).submitAnswer(encA.handles[0], encA.inputProof);
    await quizContract.connect(signers.bob).submitAnswer(encB.handles[0], encB.inputProof);

    const storedA = await quizContract.getEncryptedAnswer(signers.alice.address);
    const storedB = await quizContract.getEncryptedAnswer(signers.bob.address);

    expect(storedA).to.not.eq(storedB);
  });

  it("should not change stored data after multiple reads", async function () {
    const answer = "XYZ";
    const enc = await fhevm
      .createEncryptedInput(quizContractAddress, signers.alice.address)
      .add32(stringToBigInt(answer))
      .encrypt();
    await quizContract.connect(signers.alice).submitAnswer(enc.handles[0], enc.inputProof);

    const firstRead = await quizContract.getEncryptedAnswer(signers.alice.address);
    const secondRead = await quizContract.getEncryptedAnswer(signers.alice.address);
    expect(firstRead).to.eq(secondRead);
  });
});
