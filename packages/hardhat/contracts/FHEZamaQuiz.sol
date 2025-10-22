// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title FHEZamaQuiz
 * @notice Each user can submit only one encrypted quiz answer.
 *         The answer is stored using Fully Homomorphic Encryption (FHE).
 *         Example: the string "ABC" should be encoded as a number (e.g., uint32) 
 *         before encryption on the client side.
 */
contract FHEZamaQuiz is SepoliaConfig {
    /// @notice Stores the encrypted quiz answer for each user.
    mapping(address => euint32) private _userAnswer;

    /// @notice Tracks whether a user has already submitted an answer.
    mapping(address => bool) private _hasAnswered;

    /**
     * @notice Submits an encrypted quiz answer.
     * @param answerEncrypted The encrypted quiz answer (FHE-encrypted uint32).
     * @param proof The zero-knowledge proof associated with the encrypted value.
     * @dev Each user can only submit an answer once.
     *      Both the user and the contract are granted permission to decrypt this value.
     */
    function submitAnswer(externalEuint32 answerEncrypted, bytes calldata proof) external {
        require(!_hasAnswered[msg.sender], "Already answered");

        euint32 value = FHE.fromExternal(answerEncrypted, proof);
        _userAnswer[msg.sender] = value;

        // Grant decryption permissions to the user and the contract
        FHE.allow(value, msg.sender);
        FHE.allowThis(value);

        _hasAnswered[msg.sender] = true;
    }

    /**
     * @notice Checks if a given user has already submitted an answer.
     * @param user The address of the user to check.
     * @return True if the user has already answered the quiz.
     */
    function hasAnswered(address user) external view returns (bool) {
        return _hasAnswered[user];
    }

    /**
     * @notice Returns the encrypted quiz answer of a user.
     * @param user The address whose encrypted answer is being retrieved.
     * @return The encrypted quiz answer (`euint32`).
     * @dev Only the user or the contract itself can decrypt the returned value.
     */
    function getEncryptedAnswer(address user) external view returns (euint32) {
        return _userAnswer[user];
    }
}
